import * as vscode from "vscode";
import type { Explanations } from "./explanations";
import { buildFinalText, buildTeleprompterText } from "./teleprompter";
import { speak, stopSpeaking, stripMarkdown } from "./tts";

export interface WalkthroughHighlight {
  line: number;
  endLine?: number;
  narration: string;
}

export interface WalkthroughStep {
  file: string;
  line: number;
  endLine?: number;
  explanation: string;
  title?: string;
  highlights?: WalkthroughHighlight[];
}

export interface WalkthroughConfig {
  voice: string;
  voiceEnabled: boolean;
  autoplay: boolean;
}

type Result = Record<string, unknown>;

export interface Walkthrough {
  start(steps: WalkthroughStep[]): Promise<Result>;
  navigate(action: string, step?: number): Promise<Result>;
  status(): Result;
  stop(): void;
}

export function createWalkthrough(
  context: vscode.ExtensionContext,
  explanations: Explanations,
  getConfig: () => WalkthroughConfig,
): Walkthrough {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand("walkthrough.next", () => navigate("next")),
    vscode.commands.registerCommand("walkthrough.prev", () => navigate("prev")),
    vscode.commands.registerCommand("walkthrough.stop", stop),
  );

  let steps: WalkthroughStep[] = [];
  let currentStepIndex = -1;
  let narrationAbort: AbortController | null = null;

  async function start(newSteps: WalkthroughStep[]): Promise<Result> {
    stop();
    steps = newSteps;
    currentStepIndex = 0;
    await showCurrentStep();
    runNarration(0);
    return status();
  }

  async function runNarration(startIndex: number) {
    narrationAbort = new AbortController();
    const signal = narrationAbort.signal;

    for (let i = startIndex; i < steps.length; i++) {
      if (signal.aborted) break;

      if (i > startIndex) {
        if (!getConfig().autoplay) break;
        currentStepIndex = i;
        await showCurrentStep();
      }

      if (!getConfig().voiceEnabled) break;

      const step = steps[i];
      if (!step) continue;

      await speak(stripMarkdown(step.explanation), getConfig().voice);
      if (signal.aborted) break;

      if (step.highlights && step.highlights.length > 0) {
        const parts: string[] = [step.explanation];

        for (let h = 0; h < step.highlights.length; h++) {
          if (signal.aborted) break;
          const hl = step.highlights[h];

          parts.push(hl.narration);
          explanations.updateBubble(
            buildTeleprompterText(parts, parts.length - 1),
          );

          await explanations.highlight(step.file, hl.line, hl.endLine);
          await speak(stripMarkdown(hl.narration), getConfig().voice);
        }

        if (!signal.aborted) {
          explanations.updateBubble(buildFinalText(parts, buildControls()));
        }
      }
    }

    narrationAbort = null;
  }

  function stopNarration() {
    stopSpeaking();
    narrationAbort?.abort();
    narrationAbort = null;
  }

  async function navigate(action: string, step?: number): Promise<Result> {
    if (steps.length === 0) {
      return { ok: false, error: "No walkthrough active" };
    }

    stopNarration();

    switch (action) {
      case "stop":
        stop();
        return { ok: true, stopped: true };
      case "pause":
        stopNarration();
        return { ok: true, paused: true };
      case "resume":
        runNarration(currentStepIndex);
        return { ok: true, resumed: true };
      case "next":
        if (currentStepIndex < steps.length - 1) {
          currentStepIndex++;
        } else {
          stop();
          return { active: false, finished: true };
        }
        break;
      case "prev":
        if (currentStepIndex > 0) {
          currentStepIndex--;
        }
        break;
      case "goto":
        if (step !== undefined && step >= 0 && step < steps.length) {
          currentStepIndex = step;
        }
        break;
    }

    await showCurrentStep();
    runNarration(currentStepIndex);
    return status();
  }

  function buildControls(): string {
    const modifier = process.platform === "darwin" ? "Cmd" : "Ctrl";
    return `\n\n---\n\`${modifier}+Shift+→\` **Next** &nbsp;&nbsp; **|** &nbsp;&nbsp; \`${modifier}+Shift+←\` **Prev** &nbsp;&nbsp; **|** &nbsp;&nbsp; \`${modifier}+Shift+↓\` **Stop**`;
  }

  async function showCurrentStep() {
    const step = steps[currentStepIndex];
    if (!step) return;

    const stepLabel = `${currentStepIndex + 1}/${steps.length}`;
    const title = step.title
      ? `${stepLabel}: ${step.title}`
      : `Step ${stepLabel}`;
    const hasHighlights = step.highlights && step.highlights.length > 0;

    await explanations.show(
      step.file,
      step.line,
      step.endLine,
      hasHighlights ? step.explanation : step.explanation + buildControls(),
      title,
    );
    updateStatusBar();
  }

  function status(): Result {
    if (steps.length === 0) {
      return { active: false };
    }

    const step = steps[currentStepIndex];
    return {
      active: true,
      currentStep: currentStepIndex,
      totalSteps: steps.length,
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

  function stop() {
    stopNarration();
    steps = [];
    currentStepIndex = -1;
    explanations.clear();
    statusBarItem.hide();
  }

  function updateStatusBar() {
    if (steps.length === 0) {
      statusBarItem.hide();
      return;
    }

    const step = steps[currentStepIndex];
    const title = step?.title || "";
    statusBarItem.text = `$(book) ${currentStepIndex + 1}/${steps.length} ${title}`;
    statusBarItem.tooltip = "Click to stop walkthrough";
    statusBarItem.command = "walkthrough.stop";
    statusBarItem.show();
  }

  return { start, navigate, status, stop };
}
