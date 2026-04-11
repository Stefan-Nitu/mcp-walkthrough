import { describe, expect, test } from "bun:test";
import {
  createWalkthroughCoordinator,
  type NarrationPhase,
  type WalkthroughConfig,
  type WalkthroughState,
  type WalkthroughStep,
} from "../vscode-extension/src/walkthrough-coordinator";

function makeConfig(
  overrides: Partial<WalkthroughConfig> = {},
): () => WalkthroughConfig {
  return () => ({
    voice: "en-US-MichelleNeural",
    voiceEnabled: true,
    autoplay: false,
    ...overrides,
  });
}

function makeStep(overrides: Partial<WalkthroughStep> = {}): WalkthroughStep {
  return {
    file: "/test/file.ts",
    line: 1,
    endLine: 100,
    explanation: "Test explanation",
    ...overrides,
  };
}

async function collectStates(
  coordinator: AsyncIterable<WalkthroughState>,
  count: number,
): Promise<WalkthroughState[]> {
  const states: WalkthroughState[] = [];
  for await (const s of coordinator) {
    states.push(s);
    if (states.length >= count) break;
  }
  return states;
}

describe("WalkthroughCoordinator", () => {
  describe("start", () => {
    test("emits first state with step info", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());

      // Act
      sut.start([makeStep({ title: "Intro" })]);
      const [state] = await collectStates(sut, 1);

      // Assert
      expect(state).toMatchObject({
        phase: "show",
        stepIndex: 0,
        totalSteps: 1,
        file: "/test/file.ts",
      });
    });
  });

  describe("narration", () => {
    test("first state has selection on step range and speaks explanation", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());

      // Act
      sut.start([makeStep({ line: 10, endLine: 20 })]);
      const [state] = await collectStates(sut, 1);

      // Assert
      expect(state).toMatchObject({
        selection: { line: 10, endLine: 20 },
        speak: "Test explanation",
      });
    });

    test("highlight states move selection and speak narration", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      const step = makeStep({
        highlights: [
          { line: 5, endLine: 10, narration: "First part" },
          { line: 11, endLine: 15, narration: "Second part" },
        ],
      });

      // Act — explanation + 2 highlights + final = 4 states
      sut.start([step]);
      const states = await collectStates(sut, 4);

      // Assert
      expect(states[1]).toMatchObject({
        selection: { line: 5, endLine: 10 },
        speak: "First part",
      });
      expect(states[2]).toMatchObject({
        selection: { line: 11, endLine: 15 },
        speak: "Second part",
      });
    });

    test("bubble updates with teleprompter text during highlights", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      const step = makeStep({
        explanation: "Intro",
        highlights: [{ line: 5, narration: "Detail" }],
      });

      // Act — explanation + highlight + final = 3 states
      sut.start([step]);
      const states = await collectStates(sut, 3);

      // Assert — highlight state has bold active text
      expect(states[1]?.bubble?.text).toContain("**Detail**");
    });

    test("clears selection after step narration ends", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      const step = makeStep({
        highlights: [
          { line: 5, narration: "First" },
          { line: 10, narration: "Second" },
        ],
      });

      // Act — explanation + 2 highlights + final = 4 states
      sut.start([step]);
      const states = await collectStates(sut, 4);

      // Assert — last state has null selection
      expect(states[3]?.selection).toBeNull();
    });

    test("clears selection for step without highlights", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());

      // Act — explanation + clear = 2 states
      sut.start([makeStep()]);
      const states = await collectStates(sut, 2);

      // Assert
      expect(states[1]?.selection).toBeNull();
    });

    test("final state bubble includes controls", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      const step = makeStep({
        highlights: [{ line: 5, narration: "Detail" }],
      });

      // Act
      sut.start([step]);
      const states = await collectStates(sut, 3);

      // Assert
      expect(states[2]?.bubble?.text).toContain("**Next**");
      expect(states[2]?.speak).toBeNull();
    });

    test("skips speaking when voice disabled", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(
        makeConfig({ voiceEnabled: false }),
      );

      // Act
      sut.start([makeStep()]);
      const [state] = await collectStates(sut, 1);

      // Assert
      expect(state?.speak).toBeNull();
    });

    test("includes status label in active states", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());

      // Act
      sut.start([makeStep({ title: "Intro" })]);
      const [state] = await collectStates(sut, 1);

      // Assert
      expect(state?.statusLabel).toContain("1/1");
      expect(state?.statusLabel).toContain("Intro");
    });
  });

  describe("phase", () => {
    test("first state of a step has phase 'show'", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());

      // Act
      sut.start([makeStep()]);
      const [state] = await collectStates(sut, 1);

      // Assert
      expect(state?.phase).toBe("show");
    });

    test("highlight states have phase 'highlight'", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      const step = makeStep({
        highlights: [{ line: 5, narration: "Detail" }],
      });

      // Act — show + highlight + idle = 3 states
      sut.start([step]);
      const states = await collectStates(sut, 3);

      // Assert
      expect(states[1]?.phase).toBe("highlight");
    });

    test("final state after narration has phase 'idle'", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      const step = makeStep({
        highlights: [{ line: 5, narration: "Detail" }],
      });

      // Act
      sut.start([step]);
      const states = await collectStates(sut, 3);

      // Assert
      expect(states[2]?.phase).toBe("idle");
    });

    test("stop emits phase 'inactive'", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      sut.start([makeStep()]);

      // Act
      sut.stop();
      const [state] = await collectStates(sut, 1);

      // Assert
      expect(state?.phase).toBe("inactive");
    });

    test("step without highlights goes show then idle", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());

      // Act
      sut.start([makeStep()]);
      const states = await collectStates(sut, 2);

      // Assert
      expect(states.map((s) => s.phase)).toEqual(["show", "idle"]);
    });

    test("full sequence: show, highlights, idle", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      const step = makeStep({
        highlights: [
          { line: 5, narration: "First" },
          { line: 10, narration: "Second" },
        ],
      });

      // Act
      sut.start([step]);
      const states = await collectStates(sut, 4);

      // Assert
      expect(states.map((s) => s.phase)).toEqual([
        "show",
        "highlight",
        "highlight",
        "idle",
      ]);
    });
  });

  describe("highlight validation", () => {
    test("throws when highlight is outside step range", () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      const step = makeStep({
        line: 10,
        endLine: 20,
        highlights: [{ line: 50, narration: "Way outside" }],
      });

      // Act + Assert
      expect(() => sut.start([step])).toThrow(/outside step range/);
    });

    test("throws when highlight starts before step", () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      const step = makeStep({
        line: 10,
        endLine: 20,
        highlights: [{ line: 5, narration: "Before range" }],
      });

      // Act + Assert
      expect(() => sut.start([step])).toThrow(/outside step range/);
    });

    test("accepts highlights within step range", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      const step = makeStep({
        line: 10,
        endLine: 20,
        highlights: [{ line: 12, endLine: 15, narration: "Inside range" }],
      });

      // Act
      sut.start([step]);
      const states = await collectStates(sut, 3);

      // Assert
      expect(states.map((s) => s.phase)).toEqual(["show", "highlight", "idle"]);
    });
  });

  describe("stop", () => {
    test("emits inactive state", async () => {
      // Arrange
      const sut = createWalkthroughCoordinator(makeConfig());
      sut.start([makeStep()]);

      // Act
      sut.stop();
      const [state] = await collectStates(sut, 1);

      // Assert
      expect(state).toMatchObject({
        phase: "inactive",
        bubble: null,
        statusLabel: null,
      });
    });
  });
});
