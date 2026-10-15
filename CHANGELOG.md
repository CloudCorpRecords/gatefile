# Changelog


## 0.1.1 (2026-10-15)

Ships on npm as @reneturcios/gatefile and in the official MCP Registry.

- **More house-rule sources.** The candidate path list (remote fetch and the local collector alike) now includes docs/development/contributing.mdx, docs/development/contributing.md, AGENTS.md, and CLAUDE.md. fastmcp keeps its binding rules in docs/development/contributing.mdx behind a pointer CONTRIBUTING.md; extraction found zero gates there before this change.
- **Assignment phrasings.** The assignment_required rule now matches "must be assigned" and "must also be assigned". Verified live against PrefectHQ/fastmcp: extraction now finds assignment_required and issue_first, both blockers.
- **`gatefile mcp` subcommand.** The MCP server starts from the single published bin, the form the npm package and the MCP Registry entry invoke.
- 23 tests passing.


## 0.1.0 (2026-10-13)

First release: extract a repo's contribution gates into contribution-gates.json with quoted evidence, validate a committed file against the live repo for drift, and render a shields.io badge for the gate count. CLI and MCP server.
