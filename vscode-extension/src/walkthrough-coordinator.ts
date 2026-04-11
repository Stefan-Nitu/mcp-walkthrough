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

export type NarrationPhase = "show" | "highlight" | "idle" | "inactive";

export interface WalkthroughState {
  phase: NarrationPhase;
  stepIndex: number;
  totalSteps: number;
  file: string | null;
  selection: { line: number; endLine?: number } | null;
  bubble: { text: string; title: string } | null;
  speak: string | null;
  statusLabel: string | null;
}

export function isActive(state: WalkthroughState): boolean {
  return state.phase !== "inactive";
}

const CONTROLS_MODIFIER = process.platform === "darwin" ? "Cmd" : "Ctrl";
const CONTROLS = `\n\n---\n\`${CONTROLS_MODIFIER}+Shift+→\` **Next** &nbsp;&nbsp; **|** &nbsp;&nbsp; \`${CONTROLS_MODIFIER}+Shift+←\` **Prev** &nbsp;&nbsp; **|** &nbsp;&nbsp; \`${CONTROLS_MODIFIER}+Shift+↓\` **Stop**`;

function buildTeleprompterText(parts: string[], activeIndex: number): string {
  return parts
    .map((p, idx) => (idx === activeIndex ? `**${p}**` : p))
    .join("\n\n");
}

function buildFinalText(parts: string[], controls: string): string {
  return parts.join("\n\n") + controls;
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/\\n/g, " ")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*([^*]*)\*/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

export interface WalkthroughCoordinator
  extends AsyncIterable<WalkthroughState> {
  start(steps: WalkthroughStep[]): void;
  navigate(action: string, step?: number): void;
  stop(): void;
}

function createChannel<T>() {
  const queue: T[] = [];
  let waiting: ((value: IteratorResult<T>) => void) | null = null;
  let done = false;

  function push(value: T) {
    if (done) return;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve({ value, done: false });
    } else {
      queue.push(value);
    }
  }

  function flush() {
    queue.length = 0;
  }

  function close() {
    done = true;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve({ value: undefined as T, done: true });
    }
  }

  const iterator: AsyncIterableIterator<T> = {
    next(): Promise<IteratorResult<T>> {
      const queued = queue.shift();
      if (queued !== undefined)
        return Promise.resolve({ value: queued, done: false });
      if (done) return Promise.resolve({ value: undefined as T, done: true });
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
    return(): Promise<IteratorResult<T>> {
      return Promise.resolve({ value: undefined as T, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  return { push, flush, close, iterator };
}

export function createWalkthroughCoordinator(
  getConfig: () => WalkthroughConfig,
): WalkthroughCoordinator {
  let steps: WalkthroughStep[] = [];
  let currentStepIndex = -1;
  let abortController: AbortController | null = null;
  const channel = createChannel<WalkthroughState>();

  function inactiveState(): WalkthroughState {
    return {
      phase: "inactive",
      stepIndex: -1,
      totalSteps: 0,
      file: null,
      selection: null,
      bubble: null,
      speak: null,
      statusLabel: null,
    };
  }

  function statusLabel(): string {
    const step = steps[currentStepIndex];
    const title = step?.title || "";
    return `$(book) ${currentStepIndex + 1}/${steps.length} ${title}`;
  }

  function stepTitle(): string {
    const step = steps[currentStepIndex];
    if (!step) return "";
    const label = `${currentStepIndex + 1}/${steps.length}`;
    return step.title ? `${label}: ${step.title}` : `Step ${label}`;
  }

  function emit(phase: NarrationPhase, partial: Partial<WalkthroughState>) {
    channel.push({
      phase,
      stepIndex: currentStepIndex,
      totalSteps: steps.length,
      file: null,
      selection: null,
      bubble: null,
      speak: null,
      statusLabel: steps.length > 0 ? statusLabel() : null,
      ...partial,
    });
  }

  async function runNarration(startIndex: number) {
    abortController = new AbortController();
    const signal = abortController.signal;

    for (let i = startIndex; i < steps.length; i++) {
      if (signal.aborted) break;

      if (i > startIndex) {
        if (!getConfig().autoplay) break;
        currentStepIndex = i;
      }

      const step = steps[i];
      if (!step) continue;

      const hasHighlights = step.highlights && step.highlights.length > 0;
      const title = stepTitle();

      // Show step, speak explanation
      emit("show", {
        file: step.file,
        selection: { line: step.line, endLine: step.endLine },
        bubble: {
          text: hasHighlights ? step.explanation : step.explanation + CONTROLS,
          title,
        },
        speak: getConfig().voiceEnabled
          ? stripMarkdown(step.explanation)
          : null,
      });

      // Wait for shell to process (speak, render) before continuing
      await new Promise((r) => setTimeout(r, 0));
      if (signal.aborted || !getConfig().voiceEnabled) break;

      if (step.highlights && step.highlights.length > 0) {
        const parts: string[] = [step.explanation];

        for (let h = 0; h < step.highlights.length; h++) {
          if (signal.aborted) break;
          const hl = step.highlights[h];
          if (!hl) continue;

          parts.push(hl.narration);

          emit("highlight", {
            file: step.file,
            selection: { line: hl.line, endLine: hl.endLine },
            bubble: {
              text: buildTeleprompterText(parts, parts.length - 1),
              title,
            },
            speak: stripMarkdown(hl.narration),
          });

          await new Promise((r) => setTimeout(r, 0));
          if (signal.aborted) break;
        }

        if (!signal.aborted) {
          emit("idle", {
            file: step.file,
            selection: null,
            bubble: { text: buildFinalText(parts, CONTROLS), title },
          });
        }
      } else if (!signal.aborted) {
        emit("idle", {
          file: step.file,
          selection: null,
          bubble: { text: step.explanation + CONTROLS, title },
        });
      }
    }

    abortController = null;
  }

  function cancelNarration() {
    abortController?.abort();
    abortController = null;
    channel.flush();
  }

  function validateSteps(stepsToValidate: WalkthroughStep[]) {
    for (const step of stepsToValidate) {
      const stepEnd = step.endLine ?? step.line;
      for (const hl of step.highlights ?? []) {
        const hlEnd = hl.endLine ?? hl.line;
        if (hl.line < step.line || hlEnd > stepEnd) {
          throw new Error(
            `Highlight line ${hl.line}-${hlEnd} is outside step range ${step.line}-${stepEnd}`,
          );
        }
      }
    }
  }

  function start(newSteps: WalkthroughStep[]) {
    validateSteps(newSteps);
    cancelNarration();
    steps = newSteps;
    currentStepIndex = 0;
    runNarration(0);
  }

  function navigate(action: string, step?: number) {
    if (steps.length === 0) return;

    switch (action) {
      case "stop":
        stop();
        return;
      case "pause":
        cancelNarration();
        return;
      case "resume":
        cancelNarration();
        runNarration(currentStepIndex);
        return;
      case "next":
        if (currentStepIndex < steps.length - 1) {
          cancelNarration();
          currentStepIndex++;
        } else {
          stop();
          return;
        }
        break;
      case "prev":
        if (currentStepIndex > 0) {
          cancelNarration();
          currentStepIndex--;
        } else {
          return;
        }
        break;
      case "goto":
        if (step !== undefined && step >= 0 && step < steps.length) {
          cancelNarration();
          currentStepIndex = step;
        } else {
          return;
        }
        break;
      default:
        return;
    }

    runNarration(currentStepIndex);
  }

  function stop() {
    cancelNarration();
    steps = [];
    currentStepIndex = -1;
    channel.push(inactiveState());
  }

  return {
    start,
    navigate,
    stop,
    [Symbol.asyncIterator]() {
      return channel.iterator;
    },
  };
}
