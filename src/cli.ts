#!/usr/bin/env node
/**
 * gatefile CLI.
 *
 *   gatefile extract owner/repo [--local path] [--out file] [--json]
 *   gatefile validate owner/repo [--local path] [--file path] [--json]
 *   gatefile badge owner/repo [--local path]
 *
 * Set GITHUB_TOKEN for the 5000 req/hr authenticated rate limit.
 * --local reads files from a directory instead of the GitHub API (offline).
 */
import { readFile, writeFile } from "node:fs/promises";
import { extractGates } from "./extract.js";
import { validateGatesFile, parseGatesFile } from "./validate.js";
import { fetchRepoFiles, readLocalFiles } from "./github.js";
import { renderBadge } from "./badge.js";
import type { GatesFile } from "./types.js";

function usage(): never {
  console.error(`Usage:
  gatefile extract owner/repo [--local path] [--out file] [--json]
  gatefile validate owner/repo [--local path] [--file path] [--json]
  gatefile badge owner/repo [--local path]`);
  process.exit(2);
}

function parseRepoRef(ref: string): { owner: string; repo: string } {
  const m = /^([^/]+)\/([^/]+)$/.exec(ref.trim());
  if (!m) throw new Error(`Expected owner/repo, got: ${ref}`);
  return { owner: m[1], repo: m[2] };
}

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

async function loadFiles(ref: string, localDir: string | undefined) {
  if (localDir) {
    const files = await readLocalFiles(localDir);
    return { ref: localDir, files };
  }
  const { owner, repo } = parseRepoRef(ref);
  const files = await fetchRepoFiles(owner, repo);
  return { ref: `${owner}/${repo}`, files };
}

function printSummary(ref: string, gates: GatesFile): void {
  console.log(`gates for ${ref}: ${gates.gates.length} found in ${gates.generatedFrom.length} files`);
  for (const gate of gates.gates) {
    console.log(`  [${gate.severity}] ${gate.kind}`);
    console.log(`      "${gate.evidence}" (${gate.source})`);
  }
  if (gates.conventions.branchNaming) console.log(`  branch naming: "${gates.conventions.branchNaming}"`);
  if (gates.conventions.prTitleFormat) console.log(`  PR title: "${gates.conventions.prTitleFormat}"`);
  if (gates.conventions.requiredChecks.length > 0) {
    console.log(`  required checks: ${gates.conventions.requiredChecks.join(", ")}`);
  }
}

async function cmdExtract(ref: string, args: string[]): Promise<void> {
  const localDir = flag(args, "--local");
  const { ref: label, files } = await loadFiles(ref, localDir);
  const gates = extractGates(label, files);
  const asJson = has(args, "--json");
  if (asJson) {
    console.log(JSON.stringify(gates, null, 2));
  } else {
    printSummary(label, gates);
  }
  const out = flag(args, "--out");
  if (out) {
    await writeFile(out, JSON.stringify(gates, null, 2) + "\n", "utf8");
    console.error(`wrote ${out}`);
  }
}

async function cmdValidate(ref: string, args: string[]): Promise<void> {
  const localDir = flag(args, "--local");
  const filePath = flag(args, "--file") ?? "contribution-gates.json";
  const recordedRaw = await readFile(filePath, "utf8").catch(() => {
    throw new Error(`could not read ${filePath}: run gatefile extract --out ${filePath} first`);
  });
  const { ref: label, files } = await loadFiles(ref, localDir);
  const fresh = extractGates(label, files);
  const result = validateGatesFile(JSON.parse(recordedRaw), fresh);
  const asJson = has(args, "--json");
  if (asJson) {
    console.log(JSON.stringify({ ok: result.ok, drift: result.drift }, null, 2));
  } else if (result.ok) {
    console.log(`OK: contribution-gates.json matches fresh extraction (${fresh.gates.length} gates).`);
  } else {
    console.log(`DRIFT: ${result.drift.length} issue(s) in ${filePath}:`);
    for (const d of result.drift) console.log(`  [${d.status}] ${d.kind}: ${d.detail}`);
  }
  process.exit(result.ok ? 0 : 1);
}

async function cmdBadge(ref: string, args: string[]): Promise<void> {
  const localDir = flag(args, "--local");
  const { ref: label, files } = await loadFiles(ref, localDir);
  const gates = extractGates(label, files);
  console.log(renderBadge(label, gates));
}

async function main(): Promise<void> {
  const [cmd, ref, ...rest] = process.argv.slice(2);
  if (cmd === "mcp") {
    // Start the MCP server (stdio); the module runs on import.
    await import("./mcp.js");
    return;
  }
  if (!cmd || !ref) usage();
  try {
    if (cmd === "extract") await cmdExtract(ref, rest);
    else if (cmd === "validate") await cmdValidate(ref, rest);
    else if (cmd === "badge") await cmdBadge(ref, rest);
    else usage();
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

void main();

export { parseGatesFile };
