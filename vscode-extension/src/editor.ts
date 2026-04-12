import { resolve } from "node:path";
import * as vscode from "vscode";

type Result = Record<string, unknown>;

export async function openFileAtLine(
  filePath: string,
  line: number,
  endLine?: number,
  startChar?: number,
  endChar?: number,
  revealType: vscode.TextEditorRevealType = vscode.TextEditorRevealType.AtTop,
): Promise<vscode.TextEditor> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    const resolved = resolve(filePath);
    if (!resolved.startsWith(`${workspaceRoot}/`)) {
      throw new Error("File path outside workspace");
    }
  }

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
  }, 150);

  const startLine = Math.max(0, line - 1);
  const end = endLine ? Math.max(0, endLine - 1) : startLine;
  const colStart = startChar ?? 0;
  const colEnd = endChar ?? doc.lineAt(end).text.length;

  const range = new vscode.Range(startLine, colStart, end, colEnd);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(new vscode.Range(startLine, 0, startLine, 0), revealType);
  return editor;
}

export function getSelection(): Result {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) {
    return { ok: false, error: "No selection" };
  }

  const sel = editor.selection;
  const text = editor.document.getText(sel);

  return {
    ok: true,
    file: editor.document.uri.fsPath,
    line: sel.start.line + 1,
    endLine: sel.end.line + 1,
    text,
  };
}
