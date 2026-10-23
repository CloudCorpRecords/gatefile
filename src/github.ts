/**
 * GitHub API fetcher for the files the extractor reads.
 * Native fetch, GITHUB_TOKEN optional (5000 req/hr authenticated).
 * GATEFILE_GITHUB_BASE_URL (fallback GITHUB_BASE_URL) overrides the API
 * base so the tool can run through a local proxy that attaches a stored
 * token — the same pattern as Greenlight's GREENLIGHT_GITHUB_BASE_URL.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { basename, join } from "node:path";
import type { SourceFile } from "./extract.js";

const DEFAULT_API = "https://api.github.com";

/** The GitHub API base in use; trailing slashes are stripped. */
export function githubApiBase(): string {
  for (const raw of [process.env.GATEFILE_GITHUB_BASE_URL, process.env.GITHUB_BASE_URL]) {
    if (raw && raw.trim().length > 0) return raw.trim().replace(/\/+$/, "");
  }
  return DEFAULT_API;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "gatefile/0.1.3",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

/** Files the extractor looks for, in priority order. */
export const CANDIDATE_PATHS = [
  "CONTRIBUTING.md",
  ".github/CONTRIBUTING.md",
  "docs/CONTRIBUTING.md",
  "docs/development/contributing.mdx",
  "docs/development/contributing.md",
  "AGENTS.md",
  "CLAUDE.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/PULL_REQUEST_TEMPLATE/pull_request_template.md",
  "lefthook.yml",
  ".lefthook.yml",
  "CLA.md",
  ".github/CLA.md",
];

/** Directories that hold candidate files (used for case-insensitive discovery). */
const CANDIDATE_DIRS = ["", ".github", "docs", "docs/development", ".github/PULL_REQUEST_TEMPLATE"];

/**
 * Match candidate paths against the paths that actually exist, comparing
 * case-insensitively (PT-4): a repo whose contributing file is lowercase
 * `contributing.md` must be discovered just like `CONTRIBUTING.md`.
 * Returns the real (on-disk / in-repo) paths in candidate priority order.
 */
export function matchCandidatePaths(available: string[]): string[] {
  const byLower = new Map<string, string>();
  for (const p of available) {
    const key = p.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, p);
  }
  const matched: string[] = [];
  for (const candidate of CANDIDATE_PATHS) {
    const real = byLower.get(candidate.toLowerCase());
    if (real && !matched.includes(real)) matched.push(real);
  }
  return matched;
}

interface ContentEntry {
  type: string;
  name: string;
  path: string;
}

async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await fetch(`${githubApiBase()}/repos/${owner}/${repo}`, { headers: headers() });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: could not load ${owner}/${repo}`);
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch ?? "main";
}

async function fetchRaw(owner: string, repo: string, branch: string, path: string): Promise<string | undefined> {
  // Fetch content through the API (raw media type), not raw.githubusercontent:
  // the base-URL override then applies to content too, and a placeholder
  // proxy token (GITHUB_TOKEN=proxy) is never sent to the raw host — it
  // answers 404 to an Authorization header it cannot validate (0.1.3 fix).
  try {
    const res = await fetch(
      `${githubApiBase()}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      { headers: { ...headers(), Accept: "application/vnd.github.raw+json" } }
    );
    if (res.ok) return res.text();
  } catch {
    /* fall through to the direct raw host */
  }
  const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
  if (!res.ok) return undefined;
  return res.text();
}

async function listDir(owner: string, repo: string, dir: string): Promise<ContentEntry[]> {
  const res = await fetch(`${githubApiBase()}/repos/${owner}/${repo}/contents/${dir}`, { headers: headers() });
  if (!res.ok) return [];
  const data = (await res.json()) as ContentEntry[] | { message: string };
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch every file the extractor understands from a GitHub repo.
 * Missing files are simply skipped, so permissive repos yield few sources.
 * Candidate discovery is case-insensitive: the candidate directories are
 * listed and matched without regard to case before fetching.
 */
export async function fetchRepoFiles(owner: string, repo: string): Promise<SourceFile[]> {
  const branch = await getDefaultBranch(owner, repo);
  const files: SourceFile[] = [];

  const available: string[] = [];
  for (const dir of CANDIDATE_DIRS) {
    for (const entry of await listDir(owner, repo, dir)) {
      if (entry.type === "file") available.push(entry.path);
    }
  }
  for (const path of matchCandidatePaths(available)) {
    const content = await fetchRaw(owner, repo, branch, path);
    if (content !== undefined) files.push({ path, content });
  }
  // Fallback for candidates in directories the listing did not cover.
  for (const path of CANDIDATE_PATHS) {
    if (files.some((f) => f.path === path)) continue;
    if (available.some((a) => a.toLowerCase() === path.toLowerCase())) continue;
    const content = await fetchRaw(owner, repo, branch, path);
    if (content !== undefined) files.push({ path, content });
  }

  for (const dir of [".github/ISSUE_TEMPLATE", ".github/workflows"]) {
    const entries = await listDir(owner, repo, dir);
    for (const entry of entries) {
      if (entry.type !== "file") continue;
      if (!/\.(md|ya?ml)$/i.test(entry.name)) continue;
      if (files.some((f) => f.path === entry.path)) continue;
      const content = await fetchRaw(owner, repo, branch, entry.path);
      if (content !== undefined) files.push({ path: entry.path, content });
    }
  }

  return files;
}

/**
 * Offline mode: read the same candidate files plus workflow/lefthook configs
 * from a local directory. Candidate discovery is case-insensitive, matching
 * the API mode (PT-4).
 */
export async function readLocalFiles(dir: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const push = async (path: string): Promise<void> => {
    try {
      const content = await readFile(join(dir, path), "utf8");
      files.push({ path, content });
    } catch {
      /* missing: skip */
    }
  };

  const available: string[] = [];
  for (const sub of CANDIDATE_DIRS) {
    let names: string[] = [];
    try {
      const st = await stat(join(dir, sub));
      if (st.isDirectory()) names = await readdir(join(dir, sub));
    } catch {
      continue;
    }
    for (const name of names) available.push(sub ? `${sub}/${name}` : name);
  }
  for (const path of matchCandidatePaths(available)) await push(path);
  // Fallback: exact-case candidates in directories that were not listable.
  for (const path of CANDIDATE_PATHS) {
    if (files.some((f) => f.path === path)) continue;
    if (available.some((a) => a.toLowerCase() === path.toLowerCase())) continue;
    await push(path);
  }

  for (const sub of [".github/ISSUE_TEMPLATE", ".github/workflows"]) {
    let names: string[] = [];
    try {
      const st = await stat(join(dir, sub));
      if (st.isDirectory()) names = await readdir(join(dir, sub));
    } catch {
      continue;
    }
    for (const name of names) {
      if (!/\.(md|ya?ml)$/i.test(name)) continue;
      const path = `${sub}/${name}`;
      if (files.some((f) => f.path === path)) continue;
      await push(path);
    }
  }

  return files;
}

/**
 * The `repo` label for a local run (PT-7): never a filesystem path.
 * Prefers a valid owner/repo argument, then the checkout's git origin
 * remote, then a clean `local/<dirname>` identifier.
 */
export async function localRepoLabel(dir: string, refArg?: string): Promise<string> {
  if (refArg && /^[^/\s]+\/[^/\s]+$/.test(refArg.trim())) return refArg.trim();
  try {
    const url = await new Promise<string>((resolve, reject) => {
      execFile("git", ["-C", dir, "remote", "get-url", "origin"], { timeout: 5000 }, (err, stdout) =>
        err ? reject(err) : resolve(String(stdout).trim())
      );
    });
    const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url);
    if (m) return `${m[1]}/${m[2]}`;
  } catch {
    /* not a git checkout: fall through */
  }
  return `local/${basename(dir.replace(/\/+$/, "")) || "repo"}`;
}
