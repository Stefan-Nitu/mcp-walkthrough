import { createHash } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as vscode from "vscode";
import { getSelection, openFileAtLine } from "./editor";
import { createExplanations } from "./explanations";
import type { WalkthroughStep } from "./walkthrough";
import { createWalkthrough } from "./walkthrough";

const SOCKET_DIR = "/tmp";
const SOCKET_PREFIX = "walkthrough-bridge-";

function socketPathForDir(dir: string): string {
  const normalized = dir.replace(/\/+$/, "");
  const hash = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 16);
  return `${SOCKET_DIR}/${SOCKET_PREFIX}${hash}.sock`;
}

let server: http.Server | undefined;
let socketPath: string | undefined;

export function activate(context: vscode.ExtensionContext) {
  const explanations = createExplanations(context);
  const walkthrough = createWalkthrough(context, explanations);
  walkthroughInstance = walkthrough;

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    vscode.window.showWarningMessage(
      "Walkthrough bridge: no workspace folder open",
    );
    return;
  }

  socketPath = socketPathForDir(workspaceFolder);
  cleanupStaleSocket(socketPath);

  async function handleRequest(
    url: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (url) {
      case "/open":
        await openFileAtLine(
          data.file as string,
          data.line as number,
          data.endLine as number | undefined,
          data.startChar as number | undefined,
          data.endChar as number | undefined,
        );
        return { ok: true };

      case "/explain":
        await explanations.show(
          data.file as string,
          data.line as number,
          data.endLine as number | undefined,
          data.explanation as string,
          data.title as string | undefined,
          data.startChar as number | undefined,
          data.endChar as number | undefined,
        );
        return { ok: true };

      case "/clear":
        explanations.clear();
        return { ok: true };

      case "/walkthrough":
        return walkthrough.start(
          data.steps as WalkthroughStep[],
          data.autoplay as boolean | undefined,
          data.delayMs as number | undefined,
        );

      case "/walkthrough/navigate":
        return walkthrough.navigate(data.action as string, data.step as number);

      case "/walkthrough/status":
        return walkthrough.status();

      case "/selection":
        return getSelection();

      case "/ping":
        return { ok: true };

      default:
        throw new Error(`Unknown endpoint: ${url}`);
    }
  }

  server = http.createServer(async (req, res) => {
    if (req.method !== "POST" && req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }

    const body = req.method === "POST" ? await readBody(req) : "";
    let data: Record<string, unknown> = {};
    try {
      if (body) data = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    try {
      const result = await handleRequest(req.url || "", data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  server.listen(socketPath, () => {
    vscode.window.showInformationMessage(
      `Walkthrough bridge listening on ${socketPath}`,
    );
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    vscode.window.showErrorMessage(
      `Walkthrough bridge failed to start: ${err.message}`,
    );
  });

  context.subscriptions.push({
    dispose: () => {
      server?.close();
      if (socketPath && existsSync(socketPath)) {
        unlinkSync(socketPath);
      }
    },
  });
}

export function deactivate() {
  walkthroughInstance?.stop();
  server?.close();
  if (socketPath && existsSync(socketPath)) {
    unlinkSync(socketPath);
  }
}

let walkthroughInstance: ReturnType<typeof createWalkthrough> | undefined;

function cleanupStaleSocket(path: string): void {
  if (!existsSync(path)) return;

  const client = net.createConnection({ path }, () => {
    client.destroy();
  });

  client.on("error", () => {
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
  });
}

const MAX_BODY_SIZE = 1024 * 1024;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString();
      if (data.length > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => resolve(data));
  });
}
