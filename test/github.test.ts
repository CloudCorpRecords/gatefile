import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  githubApiBase,
  matchCandidatePaths,
  readLocalFiles,
  fetchRepoFiles,
  localRepoLabel,
  CANDIDATE_PATHS,
} from "../src/github.js";
import { extractGates } from "../src/extract.js";

const ENV_KEYS = ["GATEFILE_GITHUB_BASE_URL", "GITHUB_BASE_URL"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("githubApiBase (PT-1)", () => {
  it("defaults to https://api.github.com", () => {
    assert.equal(githubApiBase(), "https://api.github.com");
  });

  it("honors GATEFILE_GITHUB_BASE_URL and strips trailing slashes", () => {
    process.env.GATEFILE_GITHUB_BASE_URL = "http://127.0.0.1:8792/";
    assert.equal(githubApiBase(), "http://127.0.0.1:8792");
  });

  it("falls back to GITHUB_BASE_URL, tool env wins", () => {
    process.env.GITHUB_BASE_URL = "http://127.0.0.1:9999";
    assert.equal(githubApiBase(), "http://127.0.0.1:9999");
    process.env.GATEFILE_GITHUB_BASE_URL = "http://127.0.0.1:8792";
    assert.equal(githubApiBase(), "http://127.0.0.1:8792");
  });
});

describe("case-insensitive contributing discovery (PT-4)", () => {
  it("matchCandidatePaths finds a lowercase contributing.md", () => {
    const matched = matchCandidatePaths(["contributing.md", "README.md", "src/index.ts"]);
    assert.deepEqual(matched, ["contributing.md"]);
  });

  it("matchCandidatePaths keeps candidate priority order and real casing", () => {
    const matched = matchCandidatePaths(["docs/contributing.md", "Contributing.md", "agents.md"]);
    assert.deepEqual(matched, ["Contributing.md", "docs/contributing.md", "agents.md"]);
    assert.ok(CANDIDATE_PATHS.includes("CONTRIBUTING.md"));
  });

  it("readLocalFiles picks up a lowercase contributing.md and extract scans it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gatefile-pt4-"));
    try {
      await writeFile(
        join(dir, "contributing.md"),
        "Please sign the Contributor License Agreement before opening a pull request.\n",
        "utf8"
      );
      await mkdir(join(dir, ".github", "workflows"), { recursive: true });
      await writeFile(join(dir, ".github", "workflows", "ci.yml"), "name: ci\non: push\n", "utf8");
      const files = await readLocalFiles(dir);
      const paths = files.map((f) => f.path);
      assert.ok(paths.includes("contributing.md"), `contributing.md missing from ${paths}`);
      const gates = extractGates("usebruno/bruno", files);
      assert.ok(gates.generatedFrom.includes("contributing.md"));
      assert.ok(gates.gates.some((g) => g.kind === "cla_required"), "lowercase contributing.md was listed but not scanned");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fetchRepoFiles (API mode) finds a lowercase contributing.md via directory listing", async () => {
    process.env.GATEFILE_GITHUB_BASE_URL = "http://proxy.invalid:8792";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      const json = (data: unknown) => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => data,
        text: async () => (typeof data === "string" ? data : JSON.stringify(data)),
      });
      if (u.includes("/repos/o/r") && !u.includes("/contents/")) return json({ default_branch: "main" });
      if (u.includes("/contents/")) {
        const dirPath = decodeURIComponent(u.split("/contents/")[1] ?? "");
        if (dirPath === "") {
          return json([
            { type: "file", name: "contributing.md", path: "contributing.md" },
            { type: "file", name: "README.md", path: "README.md" },
            { type: "dir", name: ".github", path: ".github" },
          ]);
        }
        return json([]);
      }
      if (u.includes("raw.githubusercontent.com")) {
        if (u.endsWith("/contributing.md")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({}),
            text: async () => "Sign the Contributor License Agreement first.\n",
          };
        }
        return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}), text: async () => "not found" };
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch;
    try {
      const files = await fetchRepoFiles("o", "r");
      const paths = files.map((f) => f.path);
      assert.ok(paths.includes("contributing.md"), `contributing.md missing from ${paths}`);
      const gates = extractGates("o/r", files);
      assert.ok(gates.gates.some((g) => g.kind === "cla_required"));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("local repo label (PT-7)", () => {
  it("never puts a filesystem path in the repo field", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gatefile-pt7-"));
    try {
      const label = await localRepoLabel(dir, "not-a-repo-ref");
      assert.ok(!label.includes(dir), `label leaked the path: ${label}`);
      assert.ok(!label.startsWith("/"), `label is a path: ${label}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prefers a valid owner/repo argument over the directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gatefile-pt7-"));
    try {
      assert.equal(await localRepoLabel(dir, "usebruno/bruno"), "usebruno/bruno");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
