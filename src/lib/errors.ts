import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import { KanboxApiError } from "./kanbox-client.js";

export function formatError(error: unknown): CallToolResult {
  if (error instanceof ZodError) {
    const details = error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return {
      content: [{ type: "text", text: `Invalid parameters: ${details}` }],
      isError: true,
    };
  }

  if (error instanceof KanboxApiError) {
    return {
      content: [
        { type: "text", text: `Kanbox API error ${error.status}: ${error.body}` },
      ],
      isError: true,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export function formatResult(data: unknown): CallToolResult {
  return {
    content: [
      { type: "text", text: JSON.stringify(data) },
    ],
  };
}
