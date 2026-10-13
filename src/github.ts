/**
 * GitHub API fetcher for the files the extractor reads.
 * Native fetch, GITHUB_TOKEN optional (5000 req/hr authenticated).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SourceFile } from "./extract.js";

const API = "https://api.github.com";

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": "gatefile/0.1.0",
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
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/PULL_REQUEST_TEMPLATE/pull_request_template.md",
  "lefthook.yml",
  ".lefthook.yml",
  "CLA.md",
  ".github/CLA.md",
];

interface ContentEntry {
  type: string;
  name: string;
  path: string;
}

async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers() });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: could not load ${owner}/${repo}`);
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch ?? "main";
}

async function fetchRaw(owner: string, repo: string, branch: string, path: string): Promise<string | undefined> {
  const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, {
    headers: process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {},
  });
  if (!res.ok) return undefined;
  return res.text();
}

async function listDir(owner: string, repo: string, dir: string): Promise<ContentEntry[]> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${dir}`, { headers: headers() });
  if (!res.ok) return [];
  const data = (await res.json()) as ContentEntry[] | { message: string };
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch every file the extractor understands from a GitHub repo.
 * Missing files are simply skipped, so permissive repos yield few sources.
 */
export async function fetchRepoFiles(owner: string, repo: string): Promise<SourceFile[]> {
  const branch = await getDefaultBranch(owner, repo);
  const files: SourceFile[] = [];

  for (const path of CANDIDATE_PATHS) {
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
 * from a local directory.
 */
export async function readLocalFiles(dir: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const tryRead = async (path: string): Promise<void> => {
    try {
      const content = await readFile(join(dir, path), "utf8");
      files.push({ path, content });
    } catch {
      /* missing: skip */
    }
  };

  for (const path of CANDIDATE_PATHS) await tryRead(path);

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
      await tryRead(path);
    }
  }

  return files;
}
