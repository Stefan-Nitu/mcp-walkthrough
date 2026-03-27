import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXTENSION_ID = "undefined_publisher.walkthrough-bridge";
const VSIX_PATH = join(
  __dirname,
  "../vscode-extension/walkthrough-bridge.vsix",
);
const BRIDGE_URL = "http://127.0.0.1:7890";

export function ensureExtensionInstalled(): void {
  try {
    const installed = execSync("code --list-extensions", { encoding: "utf-8" });
    if (installed.includes(EXTENSION_ID)) {
      logger.info("Walkthrough bridge extension already installed");
      return;
    }
  } catch {
    logger.warn("Could not check installed extensions");
  }

  if (!existsSync(VSIX_PATH)) {
    logger.error({ path: VSIX_PATH }, "Extension .vsix not found");
    return;
  }

  try {
    execSync(`code --install-extension "${VSIX_PATH}"`, { encoding: "utf-8" });
    logger.info("Installed walkthrough bridge extension");
  } catch (error) {
    logger.error({ err: error }, "Failed to install extension");
  }
}

type BridgeResult = Record<string, unknown>;

export let bridgeAvailable: boolean | null = null;

export function resetBridgeState(): void {
  bridgeAvailable = null;
}

export async function checkBridge(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = (await res.json()) as BridgeResult;
    bridgeAvailable = data.ok === true;
  } catch {
    bridgeAvailable = false;
  }
  logger.info({ bridgeAvailable }, "Bridge status");
  return bridgeAvailable;
}

export function isBridgeAvailable(): boolean {
  return bridgeAvailable === true;
}

const BRIDGE_UNAVAILABLE_ERROR = "This MCP server only works from VS Code.";

async function bridgeRequest(
  endpoint: string,
  data: Record<string, unknown> = {},
): Promise<BridgeResult> {
  if (bridgeAvailable === false) {
    return { ok: false, error: BRIDGE_UNAVAILABLE_ERROR };
  }

  try {
    const res = await fetch(`${BRIDGE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return (await res.json()) as BridgeResult;
  } catch {
    bridgeAvailable = false;
    return { ok: false, error: BRIDGE_UNAVAILABLE_ERROR };
  }
}

export async function openFile(
  file: string,
  line: number,
  endLine?: number,
): Promise<BridgeResult> {
  return bridgeRequest("/open", { file, line, endLine });
}

export async function showExplanation(
  file: string,
  line: number,
  endLine: number | undefined,
  explanation: string,
  title?: string,
): Promise<BridgeResult> {
  return bridgeRequest("/explain", { file, line, endLine, explanation, title });
}

export async function clearExplanations(): Promise<BridgeResult> {
  return bridgeRequest("/clear");
}

export interface WalkthroughStep {
  file: string;
  line: number;
  endLine?: number;
  explanation: string;
  title?: string;
}

export async function startWalkthrough(
  steps: WalkthroughStep[],
  autoplay?: boolean,
  delayMs?: number,
): Promise<BridgeResult> {
  return bridgeRequest("/walkthrough", { steps, autoplay, delayMs });
}

export async function navigateWalkthrough(
  action: string,
  step?: number,
): Promise<BridgeResult> {
  return bridgeRequest("/walkthrough/navigate", { action, step });
}

export async function getWalkthroughStatus(): Promise<BridgeResult> {
  return bridgeRequest("/walkthrough/status");
}

export async function getSelection(): Promise<BridgeResult> {
  return bridgeRequest("/selection");
}
