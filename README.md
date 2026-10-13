# gatefile

**Hidden contribution gates, extracted into a file machines can read.**

Every repo hides its real rules for outside contributors: comment before you start, wait to be assigned, sign off your commits, get vouched, sign a CLA. Today you discover those rules by getting your PR auto-closed. gatefile extracts them from the repo's own docs into `contribution-gates.json`, a machine-readable format that tools (like Greenlight) and CI can consume.

## The problem

A contributor picks an issue, writes the code, opens the PR, and a bot closes it: "you were not assigned", "unvouched authors are auto-closed", "missing Signed-off-by". The rules were always in CONTRIBUTING.md, buried in prose, different on every repo. Maintainers repeat the same corrections; contributors waste the same evenings.

## What gatefile does

1. **extract**: reads CONTRIBUTING.md, PR and issue templates, DCO/CLA workflow files, lefthook hooks, and CLA files (from the GitHub API or a local directory) and emits the gates it finds, each with a real quoted line as evidence.
2. **validate**: compares a committed `contribution-gates.json` against a fresh extraction and reports drift (STALE, MISSING, SEVERITY_CHANGED). Exit code 1 on drift, so CI can enforce it.
3. **badge**: renders a README snippet that tells humans the gates in plain language.

## The contribution-gates.json format

```json
{
  "version": 1,
  "repo": "shadcn-labs/pdfcn",
  "generatedFrom": ["CONTRIBUTING.md"],
  "gates": [
    {
      "id": "claim_first",
      "kind": "claim_first",
      "severity": "blocker",
      "evidence": "Comment before starting work, and check the thread first in case someone else is already working on it.",
      "source": "CONTRIBUTING.md"
    }
  ],
  "conventions": {
    "branchNaming": "Name your branch feat/block-name",
    "prTitleFormat": "PR titles should follow Conventional Commits",
    "requiredChecks": []
  }
}
```

### Gate kinds

| kind | severity | meaning |
| --- | --- | --- |
| `claim_first` | blocker | Comment on the issue before starting work |
| `assignment_required` | blocker | Wait to be assigned before opening a PR |
| `discuss_first` | blocker | Open a discussion or issue before coding |
| `issue_first` | blocker | Every PR must be tied to an issue |
| `vouch_required` | blocker | An existing member must vouch for you |
| `collaborators_only` | blocker | Only repo collaborators may open PRs |
| `no_direct_prs` | blocker | Direct PRs are not accepted |
| `dco_required` | warn | Commits need a Signed-off-by trailer (DCO) |
| `cla_required` | warn | A Contributor License Agreement must be signed |

Severity: `blocker` gates can get a PR closed or rejected before review. `warn` gates can be fixed after the PR opens. Evidence is always a real quote from the source file, trimmed to about 140 characters, never invented.

## Usage

### CLI

```bash
# Extract gates from a repo (GitHub API, GITHUB_TOKEN optional)
gatefile extract shadcn-labs/pdfcn

# Extract from a local clone instead (fully offline)
gatefile extract local --local ./pdfcn --out contribution-gates.json

# Validate the committed file against fresh docs, exit 1 on drift
gatefile validate shadcn-labs/pdfcn --file contribution-gates.json

# Print a README snippet for humans
gatefile badge shadcn-labs/pdfcn
```

### MCP server

Add to your MCP client config:

```json
{
  "mcpServers": {
    "gatefile": {
      "command": "node",
      "args": ["/path/to/gatefile/dist/mcp.js"]
    }
  }
}
```

Tools:

| tool | inputs | what it returns |
| --- | --- | --- |
| `extract_gates` | `repo` or `localPath` | the full `contribution-gates.json` object |
| `validate_gates` | `recorded`, `repo` or `localPath` | `{ ok, drift[] }` |
| `gates_badge` | `repo` or `localPath` | README markdown snippet |

### CI example

Keep the gates file honest in a GitHub Actions workflow:

```yaml
name: gates
on:
  pull_request:
    paths: ["CONTRIBUTING.md", ".github/**", "contribution-gates.json"]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx -y gatefile extract ${{ github.repository }} --out /tmp/fresh.json
      - run: npx -y gatefile validate ${{ github.repository }} --file contribution-gates.json
```

## Development

```bash
npm install
npm test        # tsx --test, offline, 23 tests
npm run build   # tsc to dist/
npm run dev -- extract owner/repo --json
```

TypeScript ESM, Node 20+, zod for schemas, native fetch for the GitHub API. Tests use real-world fixtures in `test/fixtures/` modeled on documented cases (comment-before-starting plus DCO plus issue-first; assignment-first; vouch-only; permissive).

## License

MIT, Rene Turcios 2026.
