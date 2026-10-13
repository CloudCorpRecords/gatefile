import { z } from "zod";

/**
 * A hidden contribution gate: an unwritten ritual a repo enforces before an
 * outside PR is even allowed, extracted from the repo's own docs.
 */
export const GateKind = z.enum([
  "assignment_required",
  "claim_first",
  "discuss_first",
  "vouch_required",
  "dco_required",
  "cla_required",
  "collaborators_only",
  "issue_first",
  "no_direct_prs",
]);
export type GateKind = z.infer<typeof GateKind>;

export const GateSeverity = z.enum(["blocker", "warn"]);
export type GateSeverity = z.infer<typeof GateSeverity>;

export const Gate = z.object({
  id: z.string(),
  kind: GateKind,
  severity: GateSeverity,
  /** Real short quote from the source text, never invented. */
  evidence: z.string(),
  /** File the evidence quote came from, e.g. CONTRIBUTING.md. */
  source: z.string(),
});
export type Gate = z.infer<typeof Gate>;

export const Conventions = z.object({
  branchNaming: z.string().optional(),
  prTitleFormat: z.string().optional(),
  requiredChecks: z.array(z.string()).default([]),
});
export type Conventions = z.infer<typeof Conventions>;

export const GatesFile = z.object({
  version: z.literal(1),
  repo: z.string(),
  generatedFrom: z.array(z.string()),
  gates: z.array(Gate),
  conventions: Conventions,
});
export type GatesFile = z.infer<typeof GatesFile>;
