import * as vscode from "vscode";
import { openFileAtLine } from "./editor";

function sanitize(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\[([^\]]*)\]\(command:[^)]*\)/g, "$1");
}

export interface Explanations {
  show(
    file: string,
    line: number,
    endLine: number | undefined,
    explanation: string,
    title?: string,
    startChar?: number,
    endChar?: number,
  ): Promise<void>;
  highlight(
    file: string,
    line: number,
    endLine: number | undefined,
  ): Promise<void>;
  updateBubble(text: string): void;
  clearSelection(): void;
  clear(): void;
  dispose(): void;
}

export function createExplanations(
  context: vscode.ExtensionContext,
): Explanations {
  const commentController = vscode.comments.createCommentController(
    "walkthrough",
    "Code Walkthrough",
  );
  context.subscriptions.push(commentController);

  let activeThread: vscode.CommentThread | null = null;
  let activeComment: vscode.Comment | null = null;
  let activeEditor: vscode.TextEditor | null = null;

  async function show(
    filePath: string,
    line: number,
    endLine: number | undefined,
    explanation: string,
    title?: string,
    startChar?: number,
    endChar?: number,
  ) {
    clear();
    activeEditor = await openFileAtLine(
      filePath,
      line,
      endLine,
      startChar,
      endChar,
    );

    const uri = vscode.Uri.file(filePath);
    const startLine = Math.max(0, line - 1);
    const end = endLine ? Math.max(0, endLine - 1) : startLine;
    const range = new vscode.Range(startLine, 0, end, 0);

    const body = new vscode.MarkdownString(sanitize(explanation), true);
    body.isTrusted = true;
    body.supportThemeIcons = true;

    activeComment = {
      body,
      mode: vscode.CommentMode.Preview,
      author: { name: title || "Walkthrough" },
    };

    activeThread = commentController.createCommentThread(uri, range, [
      activeComment,
    ]);
    activeThread.canReply = false;
    activeThread.collapsibleState =
      vscode.CommentThreadCollapsibleState.Expanded;
  }

  async function highlight(
    filePath: string,
    line: number,
    endLine: number | undefined,
  ) {
    activeEditor = await openFileAtLine(
      filePath,
      line,
      endLine,
      undefined,
      undefined,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }

  function updateBubble(text: string) {
    if (!activeComment || !activeThread) return;
    const body = new vscode.MarkdownString(sanitize(text), true);
    body.isTrusted = true;
    body.supportThemeIcons = true;
    activeComment.body = body;
    activeThread.comments = [...activeThread.comments];
  }

  function clearSelection() {
    if (activeEditor) {
      const pos = activeEditor.selection.active;
      activeEditor.selection = new vscode.Selection(pos, pos);
    }
  }

  function clear() {
    if (activeThread) {
      activeThread.dispose();
      activeThread = null;
      activeComment = null;
    }
  }

  return {
    show,
    highlight,
    updateBubble,
    clearSelection,
    clear,
    dispose: clear,
  };
}
