import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectDrift, validateGatesFile, parseGatesFile } from "../src/validate.js";
import type { GatesFile } from "../src/types.js";

const base: GatesFile = {
  version: 1,
  repo: "acme/x",
  generatedFrom: ["CONTRIBUTING.md"],
  gates: [
    {
      id: "claim_first",
      kind: "claim_first",
      severity: "blocker",
      evidence: "Comment on the issue before starting work",
      source: "CONTRIBUTING.md",
    },
  ],
  conventions: { requiredChecks: [] },
};

describe("validator", () => {
  it("identical extractions produce no drift", () => {
    const fresh = structuredClone(base);
    const result = validateGatesFile(JSON.parse(JSON.stringify(base)), fresh);
    assert.equal(result.ok, true);
    assert.deepEqual(result.drift, []);
  });

  it("fresh evidence missing from the file is MISSING", () => {
    const fresh = structuredClone(base);
    fresh.gates.push({
      id: "dco_required",
      kind: "dco_required",
      severity: "warn",
      evidence: "git commit -s",
      source: "CONTRIBUTING.md",
    });
    const drift = detectDrift(base, fresh);
    assert.equal(drift.length, 1);
    assert.equal(drift[0].status, "MISSING");
    assert.equal(drift[0].kind, "dco_required");
  });

  it("recorded gate with no fresh evidence is STALE", () => {
    const fresh = structuredClone(base);
    fresh.gates = [];
    const drift = detectDrift(base, fresh);
    assert.equal(drift.length, 1);
    assert.equal(drift[0].status, "STALE");
    assert.equal(drift[0].kind, "claim_first");
  });

  it("severity changes are SEVERITY_CHANGED", () => {
    const fresh = structuredClone(base);
    fresh.gates[0].severity = "warn";
    const drift = detectDrift(base, fresh);
    assert.equal(drift.length, 1);
    assert.equal(drift[0].status, "SEVERITY_CHANGED");
    assert.match(drift[0].detail, /blocker.*warn/);
  });

  it("validateGatesFile reports ok=false when drift exists", () => {
    const fresh = structuredClone(base);
    fresh.gates = [];
    const result = validateGatesFile(structuredClone(base), fresh);
    assert.equal(result.ok, false);
    assert.equal(result.drift.length, 1);
  });

  it("parseGatesFile rejects garbage", () => {
    assert.throws(() => parseGatesFile({ nope: true }));
    assert.throws(() => parseGatesFile(null));
  });

  it("multiple drift items can coexist", () => {
    const recorded = structuredClone(base);
    recorded.gates.push({
      id: "vouch_required",
      kind: "vouch_required",
      severity: "blocker",
      evidence: "must be vouched",
      source: "CONTRIBUTING.md",
    });
    const fresh = structuredClone(base);
    fresh.gates = [];
    fresh.gates.push({
      id: "cla_required",
      kind: "cla_required",
      severity: "warn",
      evidence: "CLA.md",
      source: "CLA.md",
    });
    const drift = detectDrift(recorded, fresh);
    const statuses = drift.map((d) => `${d.status}:${d.kind}`).sort();
    assert.deepEqual(statuses, ["MISSING:cla_required", "STALE:claim_first", "STALE:vouch_required"]);
  });
});
