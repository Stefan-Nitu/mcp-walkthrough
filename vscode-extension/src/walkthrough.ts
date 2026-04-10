import * as vscode from "vscode";
import type { Explanations } from "./explanations";

export interface WalkthroughStep {
  file: string;
  line: number;
  endLine?: number;
  explanation: string;
  title?: string;
}

type Result = Record<string, unknown>;

export interface Walkthrough {
  start(
    steps: WalkthroughStep[],
    autoplay?: boolean,
    delayMs?: number,
  ): Promise<Result>;
  navigate(action: string, step?: number): Promise<Result>;
  status(): Result;
  stop(): void;
}

export function createWalkthrough(
  context: vscode.ExtensionContext,
  explanations: Explanations,
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
  let autoplayTimer: ReturnType<typeof setTimeout> | undefined;
  let autoplayEnabled = false;
  let autoplayDelayMs = 0;

  function calculateDelay(explanation: string, baseDelay: number): number {
    if (baseDelay > 0) return baseDelay;
    const words = explanation.split(/\s+/).length;
    const readingTimeMs = (words / 200) * 60 * 1000;
    return Math.max(3000, readingTimeMs);
  }

  async function start(
    newSteps: WalkthroughStep[],
    autoplay?: boolean,
    delayMs?: number,
  ): Promise<Result> {
    stop();
    steps = newSteps;
    currentStepIndex = 0;
    autoplayEnabled = autoplay ?? false;
    autoplayDelayMs = delayMs ?? 0;
    await showCurrentStep();
    scheduleAutoplay();
    return status();
  }

  function scheduleAutoplay() {
    if (autoplayTimer) clearTimeout(autoplayTimer);
    if (!autoplayEnabled) return;
    if (currentStepIndex >= steps.length - 1) return;

    const step = steps[currentStepIndex];
    if (!step) return;

    const delay = calculateDelay(step.explanation, autoplayDelayMs);
    autoplayTimer = setTimeout(async () => {
      if (currentStepIndex < steps.length - 1) {
        currentStepIndex++;
        await showCurrentStep();
        scheduleAutoplay();
      }
    }, delay);
  }

  async function navigate(action: string, step?: number): Promise<Result> {
    if (steps.length === 0) {
      return { ok: false, error: "No walkthrough active" };
    }

    autoplayEnabled = false;
    if (autoplayTimer) clearTimeout(autoplayTimer);

    switch (action) {
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
    return status();
  }

  async function showCurrentStep() {
    const step = steps[currentStepIndex];
    if (!step) return;

    const stepLabel = `Step ${currentStepIndex + 1}/${steps.length}`;
    const title = step.title ? `${stepLabel}: ${step.title}` : stepLabel;

    const modifier = process.platform === "darwin" ? "Cmd" : "Ctrl";
    const controls = `\n\n---\n\`${modifier} Shift →\` Next · \`${modifier} Shift ←\` Prev`;
    await explanations.show(
      step.file,
      step.line,
      step.endLine,
      step.explanation + controls,
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
    if (autoplayTimer) clearTimeout(autoplayTimer);
    autoplayEnabled = false;
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
