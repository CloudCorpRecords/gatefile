# Changelog


## 0.1.2 (2026-10-23)

Real 0.1.2 release (the MCP Registry previously carried a phantom 0.1.2 entry pointing at the 0.1.1 packages). Fixes from production validation: contributing-file discovery is now case-insensitive in both API and `--local` modes, so a lowercase `contributing.md` (e.g. usebruno/bruno) is listed in `generatedFrom` and actually scanned (PT-4); `--local` no longer puts a filesystem path in the `repo` field — it uses the owner/repo argument or the checkout's git origin, else a clean `local/<name>` identifier (PT-7); GitHub API base URL can be overridden with `GATEFILE_GITHUB_BASE_URL` (fallback `GITHUB_BASE_URL`) so the tool can run through a local proxy (PT-1). 32 tests passing.


## 0.1.1 (2026-10-15)

Ships on npm as @reneturcios/gatefile and in the official MCP Registry.

- **More house-rule sources.** The candidate path list (remote fetch and the local collector alike) now includes docs/development/contributing.mdx, docs/development/contributing.md, AGENTS.md, and CLAUDE.md. fastmcp keeps its binding rules in docs/development/contributing.mdx behind a pointer CONTRIBUTING.md; extraction found zero gates there before this change.
- **Assignment phrasings.** The assignment_required rule now matches "must be assigned" and "must also be assigned". Verified live against PrefectHQ/fastmcp: extraction now finds assignment_required and issue_first, both blockers.
- **`gatefile mcp` subcommand.** The MCP server starts from the single published bin, the form the npm package and the MCP Registry entry invoke.
- 23 tests passing.


## 0.1.0 (2026-10-13)

First release: extract a repo's contribution gates into contribution-gates.json with quoted evidence, validate a committed file against the live repo for drift, and render a shields.io badge for the gate count. CLI and MCP server.
