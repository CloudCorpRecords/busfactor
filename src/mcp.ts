/**
 * busfactor MCP server. Tools: analyze_bus_factor.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The analysis is pure local computation: no upstream API,
 * no authentication, no configuration.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { analyzeBusFactor, formatPayload, VERSION } from "./busfactor.js";

const TOOLS = [
  {
    name: "analyze_bus_factor",
    description:
      "Map single-author, never-reviewed files from authorship and review data: top-author share, external review coverage, and the at-risk list.",
    inputSchema: {
      type: "object" as const,
      properties: {
        files: {
          type: "array",
          description: "Files with their authorship and review data (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path (unique across the set)" },
              authors: {
                type: "array",
                description: "Authors of the file with commit counts (at least one)",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Author name" },
                    commits: {
                      type: "integer",
                      description: "Commits by this author to this file (at least 1)",
                      minimum: 1,
                    },
                  },
                  required: ["name", "commits"],
                },
              },
              reviewers: {
                type: "array",
                description: "Names that reviewed changes to this file (optional, default [])",
                items: { type: "string" },
              },
            },
            required: ["path", "authors"],
          },
        },
        threshold: {
          type: "number",
          description:
            "Top-author share at or above which a file is dominated by one author (optional, default 0.8, must be > 0 and <= 1)",
        },
      },
      required: ["files"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "busfactor", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "analyze_bus_factor") {
      const raw = (args ?? {}) as Record<string, unknown>;
      out = analyzeBusFactor(raw.files, raw.threshold);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
