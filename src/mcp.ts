/**
 * gatefile MCP server. Tools: extract_gates, validate_gates, gates_badge.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { extractGates } from "./extract.js";
import { validateGatesFile } from "./validate.js";
import { fetchRepoFiles, readLocalFiles } from "./github.js";
import { renderBadge } from "./badge.js";

const RepoRef = z.string().describe("Repo in owner/repo form, e.g. shadcn-labs/pdfcn");

const server = new McpServer({ name: "gatefile", version: "0.1.0" });

server.tool(
  "extract_gates",
  "Extract hidden contribution gates from a repo's docs into a contribution-gates.json object",
  { repo: RepoRef, localPath: z.string().optional().describe("Local directory to read instead of the GitHub API") },
  async ({ repo, localPath }) => {
    const files = localPath ? await readLocalFiles(localPath) : await (async () => {
      const [owner, name] = repo.split("/");
      return fetchRepoFiles(owner, name);
    })();
    const gates = extractGates(localPath ?? repo, files);
    return { content: [{ type: "text" as const, text: JSON.stringify(gates, null, 2) }] };
  },
);

server.tool(
  "validate_gates",
  "Compare a recorded contribution-gates.json object against a fresh extraction and report drift",
  {
    recorded: z.record(z.unknown()).describe("Parsed contribution-gates.json to validate"),
    repo: RepoRef,
    localPath: z.string().optional().describe("Local directory to read instead of the GitHub API"),
  },
  async ({ recorded, repo, localPath }) => {
    const files = localPath ? await readLocalFiles(localPath) : await (async () => {
      const [owner, name] = repo.split("/");
      return fetchRepoFiles(owner, name);
    })();
    const fresh = extractGates(localPath ?? repo, files);
    const result = validateGatesFile(recorded, fresh);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "gates_badge",
  "Render a README markdown snippet summarizing a repo's contribution gates",
  { repo: RepoRef, localPath: z.string().optional().describe("Local directory to read instead of the GitHub API") },
  async ({ repo, localPath }) => {
    const files = localPath ? await readLocalFiles(localPath) : await (async () => {
      const [owner, name] = repo.split("/");
      return fetchRepoFiles(owner, name);
    })();
    const gates = extractGates(localPath ?? repo, files);
    return { content: [{ type: "text" as const, text: renderBadge(localPath ?? repo, gates) }] };
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
