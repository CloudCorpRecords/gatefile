import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractGates, type SourceFile } from "../src/extract.js";
import { GatesFile } from "../src/types.js";

const FIX = join(fileURLToPath(import.meta.url), "..", "fixtures");
const load = async (name: string): Promise<SourceFile> => ({
  path: name,
  content: await readFile(join(FIX, name), "utf8"),
});

describe("extractor", () => {
  it("pdfcn-like repo: claim_first, dco_required, issue_first with real evidence", async () => {
    const gates = extractGates("acme/pdfcn", [await load("pdfcn-like.md")]);
    const kinds = gates.gates.map((g) => g.kind);
    assert.ok(kinds.includes("claim_first"), `missing claim_first, got ${kinds}`);
    assert.ok(kinds.includes("dco_required"), `missing dco_required, got ${kinds}`);
    assert.ok(kinds.includes("issue_first"), `missing issue_first, got ${kinds}`);
    const claim = gates.gates.find((g) => g.kind === "claim_first")!;
    assert.equal(claim.source, "pdfcn-like.md");
    assert.match(claim.evidence, /comment on the issue before starting work/i);
    const dco = gates.gates.find((g) => g.kind === "dco_required")!;
    assert.equal(dco.severity, "warn");
    assert.equal(claim.severity, "blocker");
  });

  it("fastmcp-like repo: assignment_required plus issue_first", async () => {
    const gates = extractGates("acme/fastmcp", [await load("fastmcp-like.md")]);
    const kinds = gates.gates.map((g) => g.kind);
    assert.ok(kinds.includes("assignment_required"));
    assert.ok(kinds.includes("issue_first"));
    const a = gates.gates.find((g) => g.kind === "assignment_required")!;
    assert.equal(a.severity, "blocker");
    assert.match(a.evidence, /wait to be assigned/i);
    assert.ok(!kinds.includes("dco_required"));
  });

  it("trigger-like repo: vouch_required is a blocker", async () => {
    const gates = extractGates("acme/trigger", [await load("trigger-like.md")]);
    const v = gates.gates.find((g) => g.kind === "vouch_required");
    assert.ok(v, "vouch_required not detected");
    assert.equal(v.severity, "blocker");
    assert.match(v.evidence, /vouch/i);
    assert.equal(gates.gates.length, 1);
  });

  it("permissive repo: zero blocker gates, conventions extracted", async () => {
    const gates = extractGates("acme/easy", [await load("permissive.md")]);
    const blockers = gates.gates.filter((g) => g.severity === "blocker");
    assert.equal(blockers.length, 0, `unexpected blockers: ${blockers.map((g) => g.kind)}`);
    assert.ok(gates.conventions.branchNaming, "branchNaming convention missing");
    assert.match(gates.conventions.branchNaming!, /name your branch/i);
  });

  it("dco detected via lefthook commit-msg sign-off hook", async () => {
    const gates = extractGates("acme/hooked", [await load("lefthook.yml")]);
    const dco = gates.gates.find((g) => g.kind === "dco_required");
    assert.ok(dco, "lefthook DCO hook not detected");
    assert.equal(dco.source, "lefthook.yml");
    assert.match(dco.evidence, /signed-off-by/i);
  });

  it("dco detected from workflow filename", async () => {
    const gates = extractGates("acme/wf", [{ path: ".github/workflows/dco.yml", content: "name: ci\non: push\n" }]);
    const dco = gates.gates.find((g) => g.kind === "dco_required");
    assert.ok(dco, "DCO workflow not detected");
    assert.equal(dco.source, ".github/workflows/dco.yml");
  });

  it("cla detected from CLA.md presence", async () => {
    const gates = extractGates("acme/cla", [await load("CLA.md")]);
    const cla = gates.gates.find((g) => g.kind === "cla_required");
    assert.ok(cla, "CLA.md not detected");
    assert.equal(cla.severity, "warn");
  });

  it("evidence is always a real short quote from the source", async () => {
    const file = await load("pdfcn-like.md");
    const gates = extractGates("acme/pdfcn", [file]);
    for (const gate of gates.gates) {
      assert.ok(gate.evidence.length > 0, `${gate.kind} has empty evidence`);
      assert.ok(gate.evidence.length <= 143, `${gate.kind} evidence too long: ${gate.evidence.length}`);
      if (gate.source === file.path && /\.(md|mdx|txt)$/i.test(file.path)) {
        const snippet = gate.evidence.replace(/\.\.\.$/, "");
        assert.ok(
          file.content.toLowerCase().includes(snippet.toLowerCase().slice(0, 20)),
          `${gate.kind} evidence not found in source: ${gate.evidence}`,
        );
      }
    }
  });

  it("generatedFrom lists the files scanned", async () => {
    const gates = extractGates("acme/pdfcn", [await load("pdfcn-like.md")]);
    assert.deepEqual(gates.generatedFrom, ["pdfcn-like.md"]);
  });

  it("detects the exact pdfcn phrasing: comment before starting work", async () => {
    const gates = extractGates("acme/pdfcn", [
      {
        path: "CONTRIBUTING.md",
        content:
          "Do not claim an issue silently. Comment before starting work, and check the thread first in case someone else is already working on it.",
      },
    ]);
    const claim = gates.gates.find((g) => g.kind === "claim_first");
    assert.ok(claim, "claim_first not detected for pdfcn phrasing");
    assert.equal(claim.source, "CONTRIBUTING.md");
  });

  it("output matches the GatesFile schema", async () => {
    const gates = extractGates("acme/pdfcn", [await load("pdfcn-like.md")]);
    const parsed = GatesFile.parse(JSON.parse(JSON.stringify(gates)));
    assert.equal(parsed.version, 1);
    assert.equal(parsed.repo, "acme/pdfcn");
  });

  it("prTitleFormat convention is picked up from Conventional Commits mentions", async () => {
    const gates = extractGates("acme/fastmcp", [await load("fastmcp-like.md")]);
    assert.ok(gates.conventions.prTitleFormat, "prTitleFormat missing");
    assert.match(gates.conventions.prTitleFormat!, /conventional commits/i);
  });
});
