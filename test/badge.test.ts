import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderBadge } from "../src/badge.js";
import type { GatesFile } from "../src/types.js";

const sample: GatesFile = {
  version: 1,
  repo: "acme/pdfcn",
  generatedFrom: ["CONTRIBUTING.md"],
  gates: [
    {
      id: "claim_first",
      kind: "claim_first",
      severity: "blocker",
      evidence: "Comment on the issue before starting work",
      source: "CONTRIBUTING.md",
    },
    {
      id: "dco_required",
      kind: "dco_required",
      severity: "warn",
      evidence: "Sign off every commit with git commit -s",
      source: "CONTRIBUTING.md",
    },
  ],
  conventions: {
    branchNaming: "Name your branch feat/block-name",
    requiredChecks: [],
  },
};

const empty: GatesFile = {
  version: 1,
  repo: "acme/easy",
  generatedFrom: ["CONTRIBUTING.md"],
  gates: [],
  conventions: { requiredChecks: [] },
};

describe("badge", () => {
  it("badge names each gate with severity and evidence", () => {
    const md = renderBadge("acme/pdfcn", sample);
    assert.match(md, /## Contribution gates \(acme\/pdfcn\)/);
    assert.match(md, /comment before starting/);
    assert.match(md, /DCO sign off/);
    assert.match(md, /BLOCKER/);
    assert.match(md, /Comment on the issue before starting work/);
    assert.match(md, /CONTRIBUTING\.md/);
  });

  it("badge includes conventions when present", () => {
    const md = renderBadge("acme/pdfcn", sample);
    assert.match(md, /Branch naming/);
    assert.match(md, /feat\/block-name/);
  });

  it("empty gates render a permissive message, not a blank badge", () => {
    const md = renderBadge("acme/easy", empty);
    assert.match(md, /No hidden gates found/);
  });

  it("badge contains no em dashes or en dashes", () => {
    const md = renderBadge("acme/pdfcn", sample);
    assert.ok(!/[\u2013\u2014]/.test(md), "badge must not use em or en dashes");
  });
});
