import * as vscode from "vscode";
import { openFileAtLine } from "./editor";

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

  const activeThreads: vscode.CommentThread[] = [];

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
    await openFileAtLine(filePath, line, endLine, startChar, endChar);

    const uri = vscode.Uri.file(filePath);
    const startLine = Math.max(0, line - 1);
    const end = endLine ? Math.max(0, endLine - 1) : startLine;
    const range = new vscode.Range(startLine, 0, end, 0);

    const sanitized = explanation
      .replace(/\\n/g, "\n")
      .replace(/\[([^\]]*)\]\(command:[^)]*\)/g, "$1");
    const body = new vscode.MarkdownString(sanitized, true);
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

  function clear() {
    for (const thread of activeThreads) {
      thread.dispose();
    }
    activeThreads.length = 0;
  }

  return { show, clear, dispose: clear };
}
