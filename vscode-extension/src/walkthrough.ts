import * as vscode from "vscode";
import type { Explanations } from "./explanations";
import { speak, stopSpeaking } from "./tts";
import {
  createWalkthroughCoordinator,
  type WalkthroughConfig,
  type WalkthroughState,
  type WalkthroughStep,
} from "./walkthrough-coordinator";

export type { WalkthroughConfig, WalkthroughStep };

type Result = Record<string, unknown>;

export interface Walkthrough {
  start(steps: WalkthroughStep[]): Result;
  next(): Result;
  prev(): Result;
  status(): Result;
  stop(): void;
}

export function createWalkthrough(
  context: vscode.ExtensionContext,
  explanations: Explanations,
  getConfig: () => WalkthroughConfig,
  log: vscode.LogOutputChannel,
): Walkthrough {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  context.subscriptions.push(statusBarItem);

  const coordinator = createWalkthroughCoordinator(getConfig, (msg) =>
    log.info(`[coord] ${msg}`),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("walkthrough.next", () => next()),
    vscode.commands.registerCommand("walkthrough.prev", () => prev()),
    vscode.commands.registerCommand("walkthrough.stop", () => stop()),
  );

  (async () => {
    for await (const state of coordinator) {
      try {
        log.info(
          `state: ${state.phase} step=${state.stepIndex} selection=${JSON.stringify(state.selection)} speak=${!!state.speak}`,
        );
        await renderState(state);
      } catch (err) {
        log.error(`renderState failed: ${err}`);
      }
      coordinator.next("auto");
    }
  })();

  async function renderState(state: WalkthroughState) {
    switch (state.phase) {
      case "inactive":
        explanations.clearSelection();
        explanations.clear();
        statusBarItem.hide();
        return;

      case "show":
        if (state.bubble && state.file) {
          await explanations.show(
            state.file,
            state.selection?.line ?? 1,
            state.selection?.endLine,
            state.bubble.text,
            state.bubble.title,
          );
        }
        break;

      case "highlight":
        if (state.file && state.selection) {
          await explanations.highlight(
            state.file,
            state.selection.line,
            state.selection.endLine,
          );
        }
        if (state.bubble) {
          explanations.updateBubble(state.bubble.text);
        }
        break;

      case "idle":
        if (state.bubble) {
          explanations.updateBubble(state.bubble.text);
        }
        explanations.clearSelection();
        break;
    }

    if (state.statusLabel) {
      statusBarItem.text = state.statusLabel;
      statusBarItem.tooltip = "Click to stop walkthrough";
      statusBarItem.command = "walkthrough.stop";
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }

    if (state.speak) {
      log.info(`speaking: "${state.speak.slice(0, 50)}..."`);
      await speak(state.speak, getConfig().voice);
      log.info("speak done");
    }
  }

  function start(steps: WalkthroughStep[]): Result {
    log.info(`start: ${steps.length} steps`);
    stopSpeaking();
    coordinator.start(steps);
    return { active: true, currentStep: 0, totalSteps: steps.length };
  }

  function next(): Result {
    log.info("next");
    stopSpeaking();
    coordinator.next("manual");
    return { ok: true };
  }

  function prev(): Result {
    log.info("prev");
    stopSpeaking();
    coordinator.prev("manual");
    return { ok: true };
  }

  function status(): Result {
    return { ok: true };
  }

  function stop() {
    log.info("stop");
    stopSpeaking();
    coordinator.stop();
  }

  return { start, next, prev, status, stop };
}
