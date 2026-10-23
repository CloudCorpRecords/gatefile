# Changelog


## 0.1.3 (2026-10-23)

Fix found by the 0.1.2 production re-verification: in API mode, file contents were fetched from raw.githubusercontent.com with the GITHUB_TOKEN attached — under the gh-proxy pattern (`GITHUB_TOKEN=proxy`) the raw host answers 404 to the placeholder token, so API mode silently returned zero files. Contents are now fetched through the GitHub API (raw media type), so the base-URL override applies to content as well and no token is sent to a non-API host. As a fresh registry version, 0.1.3 also fully supersedes the phantom 0.1.2 registry entry (whose package pointers still named 0.1.1 and could not be edited: the registry forbids duplicate publishes and its PUT edit endpoint rejects the OIDC publishing identity).


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
