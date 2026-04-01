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
import {
  cleanupTts,
  getVoice,
  listVoices,
  setVoice,
  speak,
  stopSpeaking,
  stripMarkdown,
} from "./tts.js";
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
      explanation: z.string().describe("Markdown explanation to display"),
      title: z.string().optional().describe("Title for the explanation"),
      startChar: z.number().optional().describe("Start character (0-based)"),
      endChar: z.number().optional().describe("End character (0-based)"),
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
    );
    if (playback.voice) {
      speak(stripMarkdown(args.explanation)).catch((err) =>
        logger.warn({ err }, "TTS failed for explain_code"),
      );
    }
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

// --- Walkthrough state ---

let activeSteps: WalkthroughStep[] = [];
let narrationAbort: AbortController | null = null;
let paused = false;
let pauseResolve: (() => void) | null = null;
const playback = { voice: true, showBubbles: true };

async function runNarration(startIndex: number) {
  narrationAbort = new AbortController();
  const signal = narrationAbort.signal;

  for (let i = startIndex; i < activeSteps.length; i++) {
    if (signal.aborted) break;

    while (paused && !signal.aborted) {
      await new Promise<void>((r) => {
        pauseResolve = r;
      });
      pauseResolve = null;
    }
    if (signal.aborted) break;

    if (i > startIndex) {
      await navigateWalkthrough("next");
    }

    if (playback.voice) {
      const step = activeSteps[i];
      if (step) {
        const text = stripMarkdown(step.explanation);
        await speak(text);
      }
    }
  }

  narrationAbort = null;

  if (!signal.aborted) {
    await navigateWalkthrough("next");
    activeSteps = [];
  }
}

function stopNarration() {
  paused = false;
  pauseResolve?.();
  stopSpeaking();
  narrationAbort?.abort();
  narrationAbort = null;
}

server.registerTool(
  "walkthrough",
  {
    description:
      "Start a multi-step code walkthrough with voice narration. Opens files, highlights code, shows inline explanation bubbles, and reads each step aloud. Voice and bubbles are on by default. Returns immediately — narration runs in background. Control with walkthrough_control (next, prev, stop, pause, resume, toggle voice/bubbles). Write explanations as natural spoken language.",
    inputSchema: {
      steps: z.array(stepSchema).describe("Array of walkthrough steps"),
      voice: z
        .boolean()
        .optional()
        .describe("Enable voice narration (default: true)"),
      showBubbles: z
        .boolean()
        .optional()
        .describe("Show explanation bubbles (default: true)"),
    },
  },
  async (args) => {
    stopNarration();
    activeSteps = args.steps as WalkthroughStep[];
    if (args.voice !== undefined) playback.voice = args.voice;
    if (args.showBubbles !== undefined) playback.showBubbles = args.showBubbles;
    paused = false;

    const result = await startWalkthrough(activeSteps, false);

    runNarration(0).catch((err) => logger.error({ err }, "Narration failed"));

    return {
      content: [
        { type: "text", text: JSON.stringify(result) },
        {
          type: "text",
          text: "Controls: next | prev | pause | resume | stop — use walkthrough_control. Toggle voice/bubbles on the fly.",
        },
      ],
    };
  },
);

server.registerTool(
  "walkthrough_control",
  {
    description:
      "Control an active walkthrough. Navigate (next/prev/goto), stop, pause, resume, or toggle voice and bubbles on the fly. Changes take effect immediately.",
    inputSchema: {
      action: z
        .enum(["next", "prev", "goto", "stop", "pause", "resume"])
        .optional()
        .describe("Navigation or playback action"),
      step: z
        .number()
        .optional()
        .describe("Step index (0-based) for goto action"),
      voice: z.boolean().optional().describe("Toggle voice narration on/off"),
      showBubbles: z
        .boolean()
        .optional()
        .describe("Toggle explanation bubbles on/off"),
    },
  },
  async (args) => {
    if (args.voice !== undefined) playback.voice = args.voice;
    if (args.showBubbles !== undefined) playback.showBubbles = args.showBubbles;

    if (args.action === "stop") {
      stopNarration();
      activeSteps = [];
      return {
        content: [
          { type: "text", text: JSON.stringify({ ok: true, stopped: true }) },
        ],
      };
    }

    if (args.action === "pause") {
      paused = true;
      stopSpeaking();
      return {
        content: [
          { type: "text", text: JSON.stringify({ ok: true, paused: true }) },
        ],
      };
    }

    if (args.action === "resume") {
      paused = false;
      pauseResolve?.();
      return {
        content: [
          { type: "text", text: JSON.stringify({ ok: true, resumed: true }) },
        ],
      };
    }

    if (
      args.action === "next" ||
      args.action === "prev" ||
      args.action === "goto"
    ) {
      stopNarration();
      const result = await navigateWalkthrough(args.action, args.step);

      if (
        result.active &&
        playback.voice &&
        typeof result.currentStep === "number"
      ) {
        runNarration(result.currentStep).catch((err) =>
          logger.error({ err }, "Narration failed"),
        );
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    return {
      content: [
        { type: "text", text: JSON.stringify({ ok: true, ...playback }) },
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
        .describe("Voice name (e.g. en-US-GuyNeural, en-US-AriaNeural)"),
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
    let filtered = args.locale
      ? voices.filter((v) =>
          v.locale.toLowerCase().startsWith(args.locale!.toLowerCase()),
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
      const originalVoice = getVoice();
      const played: string[] = [];
      const onAbort = () => stopSpeaking();
      extra.signal?.addEventListener("abort", onAbort);
      for (const v of toAudition) {
        if (extra.signal?.aborted) break;
        if (v.name.includes("Multilingual")) continue;
        setVoice(v.name);
        const name = v.name
          .replace(/Neural$/, "")
          .replace(/^[\w]+-[\w]+-/, "")
          .replace(/-/g, " ");
        await speak(
          `I'm ${name}. Here's how I sound narrating a code walkthrough for you.`,
        );
        played.push(v.name);
      }
      extra.signal?.removeEventListener("abort", onAbort);
      setVoice(originalVoice);
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
      setVoice(args.voice);
      const name = args.voice.replace(/Neural$/, "").replace(/-/g, " ");
      await speak(
        `Hi, I'm ${name}. This is how I sound when narrating a code walkthrough.`,
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
          text: JSON.stringify({ currentVoice: getVoice() }),
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

    stopNarration();
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
