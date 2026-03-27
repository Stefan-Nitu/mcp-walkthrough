#!/usr/bin/env bun

import { resolve } from "node:path";

const file = resolve("src/index.ts");

const explanation = `## MCP Server Registration

This registers the \`show_code\` tool using the new \`registerTool\` API.

**Key points:**
- Uses Zod schema for input validation
- Calls the VS Code bridge to open files
- Returns JSON result to Claude

\`\`\`typescript
const result = await openFile(args.file, args.line);
\`\`\`
`;

console.log("Showing explanation on src/index.ts:22-38...");

try {
  const res = await fetch("http://127.0.0.1:7890/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file,
      line: 22,
      endLine: 38,
      explanation,
      title: "Step 1: Tool Registration",
    }),
  });
  const data = await res.json();
  console.log("Response:", data);
} catch (error) {
  console.error(
    "Failed — is the extension running? Reload VS Code window first.",
  );
  console.error(error);
}
