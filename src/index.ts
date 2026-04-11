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
import { getConfig, updateConfig } from "./config.js";
import { cleanupTts, listVoices, speak, stopSpeaking } from "./tts.js";
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
      startChar: z.number().optional().describe("Start character (0-based)"),
      endChar: z.number().optional().describe("End character (0-based)"),
    },
  },
  async (args) => {
    const result = await openFile(
      args.file,
      args.line,
      args.endLine,
      args.startChar,
      args.endChar,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

server.registerTool(
  "explain_code",
  {
    description:
      "Open a file in VS Code, highlight lines, and show an inline markdown explanation bubble. Renders as a VS Code comment widget. Use actual newlines for paragraphs, avoid ## headers (they render too large — use **bold** instead). Inline code, code blocks, lists, and links all work.",
    inputSchema: {
      file: z.string().describe("Absolute path to the file"),
      line: z.number().describe("Start line (1-based)"),
      endLine: z.number().optional().describe("End line (1-based)"),
      explanation: z
        .string()
        .describe(
          "Markdown explanation. Use real newlines for paragraphs, NOT literal backslash-n. Avoid ## headers (too large) — use **bold** instead.",
        ),
      title: z.string().optional().describe("Title for the explanation"),
      startChar: z.number().optional().describe("Start character (0-based)"),
      endChar: z.number().optional().describe("End character (0-based)"),
      highlights: z
        .array(
          z.object({
            line: z.number().describe("Start line (1-based)"),
            endLine: z.number().optional().describe("End line (1-based)"),
            narration: z.string().describe("Spoken text for this highlight."),
          }),
        )
        .optional()
        .describe(
          "Sub-range highlights. Selection and bubble move through each as TTS narrates.",
        ),
    },
  },
  async (args) => {
    const result = await showExplanation(
      args.file,
      args.line,
      args.endLine,
      args.explanation,
      args.title,
      args.startChar,
      args.endChar,
      args.highlights,
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
  explanation: z
    .string()
    .describe(
      "Step intro — sets the context. Narrated first, shown in the bubble. Subsequent highlights append to it like a teleprompter. Use real newlines, NOT literal backslash-n.",
    ),
  title: z.string().optional().describe("Step title"),
  highlights: z
    .array(
      z.object({
        line: z.number().describe("Start line (1-based)"),
        endLine: z.number().optional().describe("End line (1-based)"),
        narration: z
          .string()
          .describe(
            "Spoken text for this highlight. Appended to the bubble as a live transcript. Natural language.",
          ),
      }),
    )
    .optional()
    .describe(
      "Sub-range highlights within the step. Selection moves through code as TTS narrates each one. Text builds up in the bubble like a teleprompter. Omit for simple single-highlight steps.",
    ),
});

server.registerTool(
  "walkthrough",
  {
    description:
      "Start or control a multi-step code walkthrough. Pass steps to start. Pass action to navigate (next/prev/goto/stop/pause/resume). Uses global voice/bubble settings from the settings tool.",
    inputSchema: {
      steps: z
        .array(stepSchema)
        .optional()
        .describe("Array of walkthrough steps (starts a new walkthrough)"),
      action: z
        .enum(["next", "prev", "goto", "stop", "pause", "resume"])
        .optional()
        .describe("Navigate or control an active walkthrough"),
      step: z
        .number()
        .optional()
        .describe("Step index (0-based) for goto action"),
    },
  },
  async (args) => {
    if (args.steps) {
      const result = await startWalkthrough(args.steps as WalkthroughStep[]);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    if (args.action) {
      const result = await navigateWalkthrough(args.action, args.step);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    return {
      content: [
        { type: "text", text: JSON.stringify(await getWalkthroughStatus()) },
      ],
    };
  },
);

server.registerTool(
  "settings",
  {
    description:
      "View or update global settings: voice narration, explanation bubbles, autoplay, autoplay delay. Changes persist across sessions.",
    inputSchema: {
      voice: z.boolean().optional().describe("Toggle voice narration on/off"),
      showBubbles: z
        .boolean()
        .optional()
        .describe("Toggle explanation bubbles on/off"),
      autoplay: z.boolean().optional().describe("Toggle autoplay on/off"),
      autoplayDelay: z
        .number()
        .optional()
        .describe(
          "Additive delay in ms on top of reading/TTS time (0 = no extra delay)",
        ),
    },
  },
  async (args) => {
    updateConfig({
      voiceEnabled: args.voice,
      showBubbles: args.showBubbles,
      autoplay: args.autoplay,
      autoplayDelay: args.autoplayDelay,
    });

    return {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, ...getConfig() }) },
      ],
    };
  },
);

server.registerTool(
  "walkthrough_voice",
  {
    description:
      "Change the narration voice. Speaks a sample so you hear the difference. Persisted across sessions. Use audition=true to hear voices back-to-back. Filter by locale and gender.",
    inputSchema: {
      voice: z
        .string()
        .optional()
        .describe("Voice name (e.g. en-US-GuyNeural, en-US-MichelleNeural)"),
      list: z
        .boolean()
        .optional()
        .describe("List available voices without playing them"),
      audition: z
        .boolean()
        .optional()
        .describe("Play voices back-to-back so you can compare"),
      locale: z
        .string()
        .optional()
        .describe("Filter by locale prefix (e.g. 'en-US', 'en', 'de')"),
      gender: z
        .enum(["Male", "Female"])
        .optional()
        .describe("Filter by gender"),
    },
  },
  async (args, extra) => {
    const voices = await listVoices();
    const locale = args.locale;
    let filtered = locale
      ? voices.filter((v) =>
          v.locale.toLowerCase().startsWith(locale.toLowerCase()),
        )
      : voices;
    if (args.gender) {
      filtered = filtered.filter((v) => v.gender === args.gender);
    }

    if (args.list) {
      return {
        content: [{ type: "text", text: JSON.stringify(filtered) }],
      };
    }

    if (args.audition) {
      const toAudition = args.locale
        ? filtered
        : filtered.filter((v) => v.locale === "en-US");
      const originalVoice = getConfig().voice;
      const played: string[] = [];
      const onAbort = () => stopSpeaking();
      extra.signal?.addEventListener("abort", onAbort);
      for (const v of toAudition) {
        if (extra.signal?.aborted) break;
        if (v.name.includes("Multilingual")) continue;
        updateConfig({ voice: v.name });
        const name = v.name
          .replace(/Neural$/, "")
          .replace(/^[\w]+-[\w]+-/, "")
          .replace(/-/g, " ");
        await speak(
          `I'm ${name}. Here's how I sound narrating a code walkthrough for you.`,
          v.name,
        );
        played.push(v.name);
      }
      extra.signal?.removeEventListener("abort", onAbort);
      updateConfig({ voice: originalVoice });
      stopSpeaking();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              auditioned: played,
              currentVoice: originalVoice,
            }),
          },
        ],
      };
    }

    if (args.voice) {
      updateConfig({ voice: args.voice });
      const name = args.voice.replace(/Neural$/, "").replace(/-/g, " ");
      await speak(
        `Hi, I'm ${name}. This is how I sound when narrating a code walkthrough.`,
        args.voice,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              voice: args.voice,
              persisted: true,
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ currentVoice: getConfig().voice }),
        },
      ],
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

    stopSpeaking();
    cleanupTts();
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
