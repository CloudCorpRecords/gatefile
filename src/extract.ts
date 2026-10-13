/**
 * Extractor: repo docs in, machine-readable contribution gates out.
 *
 * The pattern vocabulary extends greenlight's CONTRIBUTING gate parser with
 * severity levels and file-level evidence attribution, plus structural
 * signals (DCO/CLA workflows, lefthook sign-off hooks, CLA files).
 */
import type {
  Conventions,
  Gate,
  GateKind,
  GateSeverity,
  GatesFile,
} from "./types.js";

export interface SourceFile {
  /** Repo-relative path, e.g. "CONTRIBUTING.md" or ".github/workflows/dco.yml". */
  path: string;
  content: string;
}

interface TextRule {
  kind: GateKind;
  severity: GateSeverity;
  regexes: RegExp[];
}

const RULES: TextRule[] = [
  {
    kind: "claim_first",
    severity: "blocker",
    regexes: [
      /comment\s+(on\s+)?(the\s+)?issue.{0,60}before\s+(starting|working|picking|beginning)/i,
      /before\s+(starting|working\s+on|picking).{0,60}comment/i,
      /\bcomment\s+first\b/i,
      /\bcomment\b.{0,12}before\s+(starting|working)\b/i,
      /leave\s+a\s+comment.{0,60}before/i,
      /let\s+(us|maintainers)\s+know.{0,60}before\s+(you\s+)?start/i,
    ],
  },
  {
    kind: "assignment_required",
    severity: "blocker",
    regexes: [
      /wait\s+(to\s+be\s+|until).{0,30}assigned/i,
      /must\s+be\s+assigned/i,
      /request(ing)?\s+(an\s+)?assignment/i,
      /ask\s+to\s+be\s+assigned/i,
      /assigned\s+to\s+you\s+before/i,
      /\bawait(ing)?\s+assignment\b/i,
    ],
  },
  {
    kind: "discuss_first",
    severity: "blocker",
    regexes: [
      /discuss.{0,60}before\s+(opening|submitting|creating)/i,
      /open\s+(an?|the)\s+(issue|discussion)\s+before/i,
      /\bproposal\s+(first|before)/i,
      /\brfc\b.{0,40}(first|before)/i,
      /start\s+(a|an)\s+discussion/i,
    ],
  },
  {
    kind: "issue_first",
    severity: "blocker",
    regexes: [
      /every\s+(pull\s+request|PR).{0,60}(must|should|needs?\s+to)\s+(be\s+)?(tied|linked|attached)/i,
      /(tied|linked)\s+to\s+an?\s+(open\s+)?issue/i,
      /include\s+(the|an?)\s+issue\s+(number|reference|link)/i,
      /no\s+issue.{0,20}no\s+(pull\s+request|PR)/i,
    ],
  },
  {
    kind: "vouch_required",
    severity: "blocker",
    regexes: [/\bvouch/i],
  },
  {
    kind: "collaborators_only",
    severity: "blocker",
    regexes: [
      /collaborators?\s+only/i,
      /only\s+(repo\s+)?collaborators/i,
      /external\s+(pull\s+requests|prs)\s+(are|will)\s+not\s+be\s+accepted/i,
    ],
  },
  {
    kind: "no_direct_prs",
    severity: "blocker",
    regexes: [
      /do\s+not\s+open\s+(a\s+)?(direct\s+)?pull\s+request/i,
      /don't\s+open.{0,40}pull\s+request/i,
      /pull\s+requests\s+are\s+not\s+accepted/i,
    ],
  },
  {
    kind: "dco_required",
    severity: "warn",
    regexes: [
      /developer\s+certificate\s+of\s+origin/i,
      /\bDCO\b/,
      /git\s+commit\s+-s/i,
      /signed-off-by/i,
      /sign-?off\s+(your|every|each)\s+commit/i,
    ],
  },
  {
    kind: "cla_required",
    severity: "warn",
    regexes: [
      /contributor\s+license\s+agreement/i,
      /\bcla\b.{0,30}(sign|required|bot)/i,
      /sign.{0,30}\bcla\b/i,
    ],
  },
];

const MAX_EVIDENCE = 140;

/** Expand a regex match to the enclosing sentence and trim to a short quote. */
function quoteAt(text: string, regex: RegExp): string {
  const match = regex.exec(text);
  if (!match) return "";
  const start = match.index;
  const end = start + match[0].length;
  const before = text.lastIndexOf("\n", start);
  const prevSentence = Math.max(
    text.lastIndexOf(". ", start),
    text.lastIndexOf("! ", start),
    text.lastIndexOf("? ", start),
  );
  const sentStart = Math.max(before, prevSentence) + (before >= prevSentence ? 1 : 2);
  const nextNl = text.indexOf("\n", end);
  const nextSentence = Math.min(
    ...[". ", "! ", "? "]
      .map((sep) => text.indexOf(sep, end))
      .filter((i) => i >= 0),
  );
  const sentEnd =
    Math.min(nextNl < 0 ? Infinity : nextNl, Number.isFinite(nextSentence) ? nextSentence : Infinity) < Infinity
      ? Math.min(nextNl < 0 ? Infinity : nextNl, Number.isFinite(nextSentence) ? nextSentence : Infinity)
      : text.length;
  const raw = text.slice(Math.max(0, sentStart), sentEnd).replace(/\s+/g, " ").trim();
  const clipped = raw.length > MAX_EVIDENCE ? raw.slice(0, MAX_EVIDENCE) + "..." : raw;
  return clipped.replace(/[.:;,\s]+$/, (tail) => (raw.length > MAX_EVIDENCE ? "..." : tail));
}

/** Is this a text file the prose rules should run against? */
function isTextual(path: string): boolean {
  return /\.(md|mdx|txt|rst)$/i.test(path) || /(^|\/)lefthook\.ya?ml$/i.test(path);
}

function quoteSentence(text: string, regex: RegExp): string | undefined {
  const q = quoteAt(text, regex);
  return q ? q : undefined;
}

/** Extract branch naming, PR title, and required-check conventions. */
function extractConventions(files: SourceFile[]): Conventions {
  const conventions: Conventions = { requiredChecks: [] };
  const combined = files
    .filter((f) => isTextual(f.path))
    .map((f) => f.content)
    .join("\n");
  const branch = quoteSentence(
    combined,
    /(name\s+your\s+branch|branch\s+(should|must)\s+be\s+(named|called)|branch\s+naming)[^.\n]{0,80}/i,
  );
  if (branch) conventions.branchNaming = branch;
  const title = quoteSentence(
    combined,
    /(conventional\s+commits|pr\s+title\s+(should|must|format)|pull\s+request\s+title\s+(should|must))[^.\n]{0,80}/i,
  );
  if (title) conventions.prTitleFormat = title;
  const check = quoteSentence(
    combined,
    /(required\s+checks|ci\s+must\s+pass|all\s+checks\s+must\s+pass)[^.\n]{0,80}/i,
  );
  if (check) conventions.requiredChecks.push(check);
  return conventions;
}

/** Structural file-presence signals that prose rules cannot see. */
function structuralGates(files: SourceFile[]): Gate[] {
  const gates: Gate[] = [];
  const byPath = new Map(files.map((f) => [f.path, f]));
  const has = (kind: GateKind): boolean => gates.some((g) => g.kind === kind);
  const add = (gate: Gate): void => {
    if (!has(gate.kind)) gates.push(gate);
  };

  for (const file of files) {
    const p = file.path.toLowerCase();
    if (!has("dco_required") && /(^|\/)(\.github\/workflows\/)?[^/]*dco[^/]*\.(ya?ml)$/i.test(file.path)) {
      add({ id: "dco_required", kind: "dco_required", severity: "warn", evidence: file.path, source: file.path });
    }
    if (!has("cla_required") && /(^|\/)(\.github\/workflows\/)?[^/]*cla[^/]*\.(ya?ml)$/i.test(file.path)) {
      add({ id: "cla_required", kind: "cla_required", severity: "warn", evidence: file.path, source: file.path });
    }
    if (!has("cla_required") && /(^|\/)(cla\.md|contributor-license-agreement\.md)$/i.test(file.path)) {
      add({ id: "cla_required", kind: "cla_required", severity: "warn", evidence: file.path, source: file.path });
    }
    if (/(^|\/)lefthook\.ya?ml$/i.test(file.path) && /commit-msg/i.test(file.content) && /sign-?off/i.test(file.content)) {
      const q = quoteAt(file.content, /sign-?off[^.\n]{0,80}/i) || file.path;
      add({ id: "dco_required", kind: "dco_required", severity: "warn", evidence: q, source: file.path });
    }
    void byPath;
    void p;
  }
  return gates;
}

/**
 * Extract contribution gates from repo files.
 *
 * One gate per kind; evidence is a real quote from the first source file
 * (in input order) that contains it. Files are scanned in the order given.
 */
export function extractGates(repo: string, files: SourceFile[]): GatesFile {
  const gates: Gate[] = [];
  const seen = new Set<GateKind>();

  for (const file of files) {
    if (!isTextual(file.path)) continue;
    for (const rule of RULES) {
      if (seen.has(rule.kind)) continue;
      const found = rule.regexes.find((re) => re.test(file.content));
      if (found) {
        const evidence = quoteAt(file.content, found);
        seen.add(rule.kind);
        gates.push({
          id: rule.kind,
          kind: rule.kind,
          severity: rule.severity,
          evidence: evidence || found.source,
          source: file.path,
        });
      }
    }
  }

  for (const gate of structuralGates(files)) {
    if (!seen.has(gate.kind)) {
      seen.add(gate.kind);
      gates.push(gate);
    }
  }

  return {
    version: 1,
    repo,
    generatedFrom: files.map((f) => f.path),
    gates: gates.sort((a, b) => a.kind.localeCompare(b.kind)),
    conventions: extractConventions(files),
  };
}
