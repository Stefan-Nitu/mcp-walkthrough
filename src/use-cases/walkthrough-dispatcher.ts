export type NavigateAction =
  | "next"
  | "prev"
  | "goto"
  | "stop"
  | "pause"
  | "resume";

export interface Step {
  file: string;
  line: number;
  endLine?: number;
  startChar?: number;
  endChar?: number;
  explanation?: string;
  title?: string;
  highlights?: Array<{ line: number; endLine?: number; narration: string }>;
}

export interface WalkthroughDispatcherInput {
  steps?: Step[];
  action?: NavigateAction | "clear";
  step?: number;
}

export type WalkthroughDispatcherResult =
  | { type: "getStatus" }
  | { type: "clear" }
  | { type: "navigate"; action: NavigateAction; step?: number }
  | { type: "singleExplain"; step: Step }
  | {
      type: "highlightOnly";
      file: string;
      line: number;
      endLine?: number;
      startChar?: number;
      endChar?: number;
    }
  | { type: "startWalkthrough"; steps: Step[] };

export class WalkthroughDispatcherUseCase {
  execute(input: WalkthroughDispatcherInput): WalkthroughDispatcherResult {
    const steps = input.steps;

    if (steps && steps.length > 0) {
      const [step] = steps;
      if (steps.length === 1 && step) {
        if (step.explanation !== undefined) {
          return { type: "singleExplain", step };
        }
        const result: Extract<
          WalkthroughDispatcherResult,
          { type: "highlightOnly" }
        > = {
          type: "highlightOnly",
          file: step.file,
          line: step.line,
        };
        if (step.endLine !== undefined) result.endLine = step.endLine;
        if (step.startChar !== undefined) result.startChar = step.startChar;
        if (step.endChar !== undefined) result.endChar = step.endChar;
        return result;
      }
      return { type: "startWalkthrough", steps };
    }

    if (input.action === "clear") {
      return { type: "clear" };
    }

    if (input.action) {
      const result: Extract<WalkthroughDispatcherResult, { type: "navigate" }> =
        {
          type: "navigate",
          action: input.action,
        };
      if (input.step !== undefined) result.step = input.step;
      return result;
    }

    return { type: "getStatus" };
  }
}
