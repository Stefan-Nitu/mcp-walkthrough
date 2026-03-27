import * as http from "node:http";
import * as vscode from "vscode";

const PORT = 7890;
let server: http.Server | undefined;
let commentController: vscode.CommentController;
const activeThreads: vscode.CommentThread[] = [];

interface WalkthroughStep {
  file: string;
  line: number;
  endLine?: number;
  explanation: string;
  title?: string;
}

let walkthroughSteps: WalkthroughStep[] = [];
let currentStepIndex = -1;
let statusBarItem: vscode.StatusBarItem;
let autoplayTimer: ReturnType<typeof setTimeout> | undefined;
let autoplayEnabled = false;
let autoplayDelayMs = 0;

export function activate(context: vscode.ExtensionContext) {
  commentController = vscode.comments.createCommentController(
    "walkthrough",
    "Code Walkthrough",
  );
  context.subscriptions.push(commentController);

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand("walkthrough.next", () =>
      navigateWalkthrough("next"),
    ),
    vscode.commands.registerCommand("walkthrough.prev", () =>
      navigateWalkthrough("prev"),
    ),
    vscode.commands.registerCommand("walkthrough.stop", stopWalkthrough),
  );

  server = http.createServer(async (req, res) => {
    if (req.method !== "POST" && req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }

    const body = req.method === "POST" ? await readBody(req) : "";
    const data = body ? JSON.parse(body) : {};

    try {
      const result = await handleRequest(req.url || "", data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  server.listen(PORT, "127.0.0.1", () => {
    vscode.window.showInformationMessage(
      `Walkthrough bridge listening on port ${PORT}`,
    );
  });

  context.subscriptions.push({ dispose: () => server?.close() });
}

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
      await showExplanation(
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
      clearAllThreads();
      return { ok: true };

    case "/walkthrough":
      return startWalkthrough(
        data.steps as WalkthroughStep[],
        data.autoplay as boolean | undefined,
        data.delayMs as number | undefined,
      );

    case "/walkthrough/navigate":
      return navigateWalkthrough(data.action as string, data.step as number);

    case "/walkthrough/status":
      return getWalkthroughStatus();

    case "/selection":
      return getSelection();

    case "/ping":
      return { ok: true };

    default:
      throw new Error(`Unknown endpoint: ${url}`);
  }
}

export function deactivate() {
  stopWalkthrough();
  server?.close();
}

async function openFileAtLine(
  filePath: string,
  line: number,
  endLine?: number,
  startChar?: number,
  endChar?: number,
) {
  const activeTerminal = vscode.window.activeTerminal;

  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, {
    preview: false,
    preserveFocus: true,
  });

  vscode.commands.executeCommand("revealInExplorer", uri);
  setTimeout(() => {
    if (activeTerminal) {
      activeTerminal.show(false);
    } else {
      vscode.commands.executeCommand("workbench.action.focusPanel");
    }
  }, 300);

  const startLine = Math.max(0, line - 1);
  const end = endLine ? Math.max(0, endLine - 1) : startLine;

  const colStart = startChar ?? 0;
  const colEnd = endChar ?? doc.lineAt(end).text.length;

  const range = new vscode.Range(startLine, colStart, end, colEnd);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(
    new vscode.Range(startLine, 0, startLine, 0),
    vscode.TextEditorRevealType.AtTop,
  );
}

async function showExplanation(
  filePath: string,
  line: number,
  endLine: number | undefined,
  explanation: string,
  title?: string,
  startChar?: number,
  endChar?: number,
) {
  clearAllThreads();
  await openFileAtLine(filePath, line, endLine, startChar, endChar);

  const uri = vscode.Uri.file(filePath);
  const startLine = Math.max(0, line - 1);
  const end = endLine ? Math.max(0, endLine - 1) : startLine;
  const range = new vscode.Range(startLine, 0, end, 0);

  const body = new vscode.MarkdownString(explanation, true);
  body.isTrusted = true;
  body.supportThemeIcons = true;

  const comment: vscode.Comment = {
    body,
    mode: vscode.CommentMode.Preview,
    author: { name: "Walkthrough" },
  };

  const thread = commentController.createCommentThread(uri, range, [comment]);
  thread.canReply = false;
  thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
  if (title) {
    thread.label = title;
  }

  activeThreads.push(thread);
}

// --- Walkthrough playback ---

function calculateDelay(explanation: string, baseDelay: number): number {
  if (baseDelay > 0) return baseDelay;
  // ~200 words per minute reading speed, minimum 3s
  const words = explanation.split(/\s+/).length;
  const readingTimeMs = (words / 200) * 60 * 1000;
  return Math.max(3000, readingTimeMs);
}

async function startWalkthrough(
  steps: WalkthroughStep[],
  autoplay?: boolean,
  delayMs?: number,
): Promise<Record<string, unknown>> {
  stopWalkthrough();
  walkthroughSteps = steps;
  currentStepIndex = 0;
  autoplayEnabled = autoplay ?? false;
  autoplayDelayMs = delayMs ?? 0;
  await showCurrentStep();
  scheduleAutoplay();
  return getWalkthroughStatus();
}

function scheduleAutoplay() {
  if (autoplayTimer) clearTimeout(autoplayTimer);
  if (!autoplayEnabled) return;
  if (currentStepIndex >= walkthroughSteps.length - 1) return;

  const step = walkthroughSteps[currentStepIndex];
  if (!step) return;

  const delay = calculateDelay(step.explanation, autoplayDelayMs);
  autoplayTimer = setTimeout(async () => {
    if (currentStepIndex < walkthroughSteps.length - 1) {
      currentStepIndex++;
      await showCurrentStep();
      scheduleAutoplay();
    }
  }, delay);
}

async function navigateWalkthrough(
  action: string,
  step?: number,
): Promise<Record<string, unknown>> {
  if (walkthroughSteps.length === 0) {
    return { ok: false, error: "No walkthrough active" };
  }

  // Manual navigation stops autoplay
  autoplayEnabled = false;
  if (autoplayTimer) clearTimeout(autoplayTimer);

  switch (action) {
    case "next":
      if (currentStepIndex < walkthroughSteps.length - 1) {
        currentStepIndex++;
      } else {
        stopWalkthrough();
        return { active: false, finished: true };
      }
      break;
    case "prev":
      if (currentStepIndex > 0) {
        currentStepIndex--;
      }
      break;
    case "goto":
      if (step !== undefined && step >= 0 && step < walkthroughSteps.length) {
        currentStepIndex = step;
      }
      break;
  }

  await showCurrentStep();
  return getWalkthroughStatus();
}

async function showCurrentStep() {
  const step = walkthroughSteps[currentStepIndex];
  if (!step) return;

  const stepLabel = `Step ${currentStepIndex + 1}/${walkthroughSteps.length}`;
  const title = step.title ? `${stepLabel}: ${step.title}` : stepLabel;

  await showExplanation(
    step.file,
    step.line,
    step.endLine,
    step.explanation,
    title,
  );
  updateStatusBar();
}

function getWalkthroughStatus(): Record<string, unknown> {
  if (walkthroughSteps.length === 0) {
    return { active: false };
  }

  const step = walkthroughSteps[currentStepIndex];
  return {
    active: true,
    currentStep: currentStepIndex,
    totalSteps: walkthroughSteps.length,
    step: step
      ? {
          file: step.file,
          line: step.line,
          endLine: step.endLine,
          title: step.title,
        }
      : null,
  };
}

function stopWalkthrough() {
  if (autoplayTimer) clearTimeout(autoplayTimer);
  autoplayEnabled = false;
  walkthroughSteps = [];
  currentStepIndex = -1;
  clearAllThreads();
  statusBarItem.hide();
}

function updateStatusBar() {
  if (walkthroughSteps.length === 0) {
    statusBarItem.hide();
    return;
  }

  const step = walkthroughSteps[currentStepIndex];
  const title = step?.title || "";
  statusBarItem.text = `$(book) ${currentStepIndex + 1}/${walkthroughSteps.length} ${title}`;
  statusBarItem.tooltip = "Click to stop walkthrough";
  statusBarItem.command = "walkthrough.stop";
  statusBarItem.show();
}

// --- Selection ---

function getSelection(): Record<string, unknown> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    return { ok: false, error: "No selection" };
  }

  const selection = editor.selection;
  const text = editor.document.getText(selection);

  return {
    ok: true,
    file: editor.document.uri.fsPath,
    line: selection.start.line + 1,
    endLine: selection.end.line + 1,
    text,
  };
}

// --- Utilities ---

function clearAllThreads() {
  for (const thread of activeThreads) {
    thread.dispose();
  }
  activeThreads.length = 0;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on("end", () => resolve(data));
  });
}
