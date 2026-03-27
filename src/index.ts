#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  checkBridge,
  clearExplanations,
  ensureExtensionInstalled,
  getSelection,
  getWalkthroughStatus,
  navigateWalkthrough,
  openFile,
  showExplanation,
  startWalkthrough,
  type WalkthroughStep,
} from "./bridge.js";
import { flushLogs, logger } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8"),
);

const server = new McpServer({
  name: "mcp-walkthrough",
  version: packageJson.version,
});

server.registerTool(
  "show_code",
  {
    description:
      "Open a file in VS Code and highlight specific lines. Use this to walk the user through code.",
    inputSchema: {
      file: z.string().describe("Absolute path to the file"),
      line: z.number().describe("Start line (1-based)"),
      endLine: z.number().optional().describe("End line (1-based)"),
    },
  },
  async (args) => {
    const result = await openFile(args.file, args.line, args.endLine);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

server.registerTool(
  "explain_code",
  {
    description:
      "Open a file in VS Code, highlight lines, and show an inline markdown explanation bubble. Use this to walk the user through code with rich annotations.",
    inputSchema: {
      file: z.string().describe("Absolute path to the file"),
      line: z.number().describe("Start line (1-based)"),
      endLine: z.number().optional().describe("End line (1-based)"),
      explanation: z.string().describe("Markdown explanation to display"),
      title: z.string().optional().describe("Title for the explanation"),
    },
  },
  async (args) => {
    const result = await showExplanation(
      args.file,
      args.line,
      args.endLine,
      args.explanation,
      args.title,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

server.registerTool(
  "clear_explanations",
  {
    description: "Remove all walkthrough explanation bubbles from the editor.",
  },
  async () => {
    const result = await clearExplanations();
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

const stepSchema = z.object({
  file: z.string().describe("Absolute path to the file"),
  line: z.number().describe("Start line (1-based)"),
  endLine: z.number().optional().describe("End line (1-based)"),
  explanation: z.string().describe("Markdown explanation"),
  title: z.string().optional().describe("Step title"),
});

server.registerTool(
  "walkthrough",
  {
    description:
      "Start a multi-step code walkthrough. Sends all steps to VS Code at once. The extension handles navigation — user clicks prev/next or uses Cmd+Shift+Left/Right. Optional autoplay with delay between steps. Returns current step state so you can navigate with walkthrough_navigate.",
    inputSchema: {
      steps: z.array(stepSchema).describe("Array of walkthrough steps"),
      autoplay: z
        .boolean()
        .optional()
        .describe("Auto-advance through steps (default: false)"),
      delayMs: z
        .number()
        .optional()
        .describe(
          "Delay between steps in ms when autoplay is on (default: 5000)",
        ),
    },
  },
  async (args) => {
    const result = await startWalkthrough(
      args.steps as WalkthroughStep[],
      args.autoplay,
      args.delayMs,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

server.registerTool(
  "walkthrough_navigate",
  {
    description:
      "Navigate an active walkthrough. Use when the user says next, back, or asks to jump to a step. Returns the current step state.",
    inputSchema: {
      action: z.enum(["next", "prev", "goto"]).describe("Navigation action"),
      step: z
        .number()
        .optional()
        .describe("Step index (0-based) for goto action"),
    },
  },
  async (args) => {
    const result = await navigateWalkthrough(args.action, args.step);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

server.registerTool(
  "walkthrough_status",
  {
    description:
      "Get the current state of an active walkthrough — which step, total steps, step details.",
  },
  async () => {
    const result = await getWalkthroughStatus();
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

server.registerTool(
  "get_selection",
  {
    description:
      "Get the currently selected/highlighted code in VS Code. Returns the file path, line range, and selected text. Use when the user wants to discuss specific code they've highlighted.",
  },
  async () => {
    const result = await getSelection();
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

async function main() {
  ensureExtensionInstalled();

  await checkBridge();

  const transport = new StdioServerTransport();

  let cleanupStarted = false;

  const cleanup = async () => {
    if (cleanupStarted) return;
    cleanupStarted = true;

    logger.info("Shutting down...");
    flushLogs();

    const timeoutId = setTimeout(() => {
      logger.error("Cleanup timeout - forcing exit after 5 seconds");
      flushLogs();
      process.exit(1);
    }, 5000);

    try {
      await server.close();
      clearTimeout(timeoutId);
      logger.info("Cleanup completed");
      process.exit(0);
    } catch (error) {
      clearTimeout(timeoutId);
      logger.error({ err: error }, "Error during cleanup");
      flushLogs();
      process.exit(1);
    }
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  await server.connect(transport);

  process.stdin.once("end", cleanup);
  process.stdin.once("close", cleanup);

  logger.info("mcp-walkthrough server started");
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  flushLogs();
  process.exit(1);
});
