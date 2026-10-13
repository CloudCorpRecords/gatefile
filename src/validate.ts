/**
 * Validator: compare a recorded contribution-gates.json against a fresh
 * extraction and report drift. Designed for CI: any drift means exit 1.
 */
import type { GateKind, GatesFile } from "./types.js";
import { GatesFile as GatesFileSchema } from "./types.js";

export type DriftStatus = "STALE" | "MISSING" | "SEVERITY_CHANGED";

export interface DriftItem {
  status: DriftStatus;
  kind: GateKind;
  detail: string;
}

export interface ValidationResult {
  ok: boolean;
  drift: DriftItem[];
}

/**
 * Gates recorded in the file that no longer have evidence in the fresh
 * extraction are STALE; gates with fresh evidence but missing from the file
 * are MISSING; matching kinds with different severities are SEVERITY_CHANGED.
 */
export function detectDrift(recorded: GatesFile, fresh: GatesFile): DriftItem[] {
  const drift: DriftItem[] = [];
  const recordedByKind = new Map(recorded.gates.map((g) => [g.kind, g]));
  const freshByKind = new Map(fresh.gates.map((g) => [g.kind, g]));

  for (const gate of recorded.gates) {
    const live = freshByKind.get(gate.kind);
    if (!live) {
      drift.push({
        status: "STALE",
        kind: gate.kind,
        detail: `recorded gate ${gate.kind} (severity ${gate.severity}) is no longer evidenced in ${fresh.generatedFrom.join(", ") || "repo docs"}`,
      });
    } else if (live.severity !== gate.severity) {
      drift.push({
        status: "SEVERITY_CHANGED",
        kind: gate.kind,
        detail: `recorded severity ${gate.severity} but fresh extraction says ${live.severity}`,
      });
    }
  }

  for (const gate of fresh.gates) {
    if (!recordedByKind.has(gate.kind)) {
      drift.push({
        status: "MISSING",
        kind: gate.kind,
        detail: `fresh evidence for ${gate.kind} (${gate.source}: "${gate.evidence}") is not recorded in contribution-gates.json`,
      });
    }
  }

  return drift;
}

/** Parse an unknown value as a GatesFile, throwing on schema violations. */
export function parseGatesFile(raw: unknown): GatesFile {
  return GatesFileSchema.parse(raw);
}

/** Full validation: schema-check the recorded file, then detect drift. */
export function validateGatesFile(recorded: unknown, fresh: GatesFile): ValidationResult {
  const parsed = parseGatesFile(recorded);
  const drift = detectDrift(parsed, fresh);
  return { ok: drift.length === 0, drift };
}
