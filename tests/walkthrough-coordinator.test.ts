import { describe, expect, test } from "bun:test";
import {
  createWalkthroughCoordinator,
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
    highlights: [{ line: 5, narration: "Default highlight" }],
    ...overrides,
  };
}

function makeSUT(config = makeConfig()) {
  const sut = createWalkthroughCoordinator(config);
  const iter = sut[Symbol.asyncIterator]();

  async function pull(): Promise<WalkthroughState> {
    const { value } = await iter.next();
    return value;
  }

  return { sut, pull };
}

async function expectNothing(pull: () => Promise<WalkthroughState>) {
  const timeout = new Promise<string>((r) =>
    setTimeout(() => r("timeout"), 50),
  );
  const next = pull().then(() => "state");
  expect(await Promise.race([timeout, next])).toBe("timeout");
}

describe("WalkthroughCoordinator", () => {
  describe("next(auto)", () => {
    test("advances through highlights", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([makeStep()]);
      await pull(); // show

      // Act
      sut.next("auto");

      // Assert
      const state = await pull();
      expect(state.phase).toBe("highlight");
    });

    test("stays at idle when autoplay is off", async () => {
      // Arrange
      const { sut, pull } = makeSUT(makeConfig({ autoplay: false }));
      sut.start([makeStep(), makeStep()]);
      await pull(); // show
      sut.next("auto");
      await pull(); // highlight
      sut.next("auto");
      await pull(); // idle

      // Act
      sut.next("auto");

      // Assert
      await expectNothing(pull);
    });

    test("advances past idle when autoplay is on", async () => {
      // Arrange
      const { sut, pull } = makeSUT(makeConfig({ autoplay: true }));
      sut.start([makeStep(), makeStep()]);
      await pull(); // step 0 show
      sut.next("auto");
      await pull(); // step 0 highlight
      sut.next("auto");
      await pull(); // step 0 idle

      // Act
      sut.next("auto");

      // Assert
      const state = await pull();
      expect(state.stepIndex).toBe(1);
      expect(state.phase).toBe("show");
    });

    test("overwrites stale state after manual prev", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([
        makeStep({
          highlights: [
            { line: 5, narration: "First" },
            { line: 10, narration: "Second" },
          ],
        }),
      ]);
      await pull(); // show
      sut.next("auto"); // pushes highlight 1 into slot
      sut.prev("manual"); // overwrites slot with show

      // Assert
      const state = await pull();
      expect(state.phase).toBe("show");
    });
  });

  describe("next(manual)", () => {
    test("advances past idle regardless of autoplay", async () => {
      // Arrange
      const { sut, pull } = makeSUT(makeConfig({ autoplay: false }));
      sut.start([makeStep(), makeStep()]);
      await pull(); // show
      sut.next("auto");
      await pull(); // highlight
      sut.next("auto");
      await pull(); // idle

      // Act
      sut.next("manual");

      // Assert
      const state = await pull();
      expect(state.stepIndex).toBe(1);
    });

    test("stops at the end", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([makeStep()]);
      await pull(); // show
      sut.next("auto");
      await pull(); // highlight
      sut.next("auto");
      await pull(); // idle

      // Act
      sut.next("manual");

      // Assert
      const state = await pull();
      expect(state.phase).toBe("inactive");
    });
  });

  describe("prev(manual)", () => {
    test("goes back one highlight", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([
        makeStep({
          highlights: [
            { line: 5, narration: "First" },
            { line: 10, narration: "Second" },
          ],
        }),
      ]);
      await pull(); // show
      sut.next("auto");
      await pull(); // highlight 1
      sut.next("auto");
      await pull(); // highlight 2

      // Act
      sut.prev("manual");

      // Assert
      const state = await pull();
      expect(state.phase).toBe("highlight");
      expect(state.speak).toBe("First");
    });

    test("at idle jumps to previous step", async () => {
      // Arrange
      const { sut, pull } = makeSUT(makeConfig({ autoplay: true }));
      sut.start([makeStep(), makeStep()]);
      await pull(); // step 0 show
      sut.next("auto");
      await pull(); // step 0 highlight
      sut.next("auto");
      await pull(); // step 0 idle
      sut.next("auto"); // autoplay → step 1 show
      await pull();
      sut.next("auto");
      await pull(); // step 1 highlight
      sut.next("auto");
      await pull(); // step 1 idle

      // Act
      sut.prev("manual");

      // Assert
      const state = await pull();
      expect(state.stepIndex).toBe(0);
      expect(state.phase).toBe("show");
    });

    test("at show jumps to previous step", async () => {
      // Arrange
      const { sut, pull } = makeSUT(makeConfig({ autoplay: true }));
      sut.start([makeStep(), makeStep()]);
      await pull();
      sut.next("auto");
      await pull();
      sut.next("auto");
      await pull(); // step 0 idle
      sut.next("auto"); // autoplay → step 1 show
      await pull();

      // Act
      sut.prev("manual");

      // Assert
      const state = await pull();
      expect(state.stepIndex).toBe(0);
      expect(state.phase).toBe("show");
    });

    test("no-op at first step first state", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([makeStep()]);
      await pull();

      // Act
      sut.prev("manual");

      // Assert
      await expectNothing(pull);
    });
  });

  describe("restart", () => {
    test("jumps to first highlight of current step", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([
        makeStep({
          highlights: [
            { line: 5, narration: "First" },
            { line: 10, narration: "Second" },
          ],
        }),
      ]);
      await pull(); // show
      sut.next("auto");
      await pull(); // highlight 1
      sut.next("auto");
      await pull(); // highlight 2

      // Act
      sut.restart();

      // Assert
      const state = await pull();
      expect(state.phase).toBe("highlight");
      expect(state.speak).toBe("First");
    });
  });

  describe("stop", () => {
    test("emits inactive", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([makeStep()]);
      await pull();

      // Act
      sut.stop();

      // Assert
      const state = await pull();
      expect(state).toMatchObject({ phase: "inactive", bubble: null });
    });

    test("next after stop is no-op", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([makeStep()]);
      await pull();
      sut.stop();
      await pull(); // inactive

      // Act
      sut.next("auto");

      // Assert
      await expectNothing(pull);
    });
  });

  describe("validation", () => {
    test("throws when highlight is outside step range", () => {
      // Arrange
      const { sut } = makeSUT();

      // Act + Assert
      expect(() =>
        sut.start([
          makeStep({
            line: 10,
            endLine: 20,
            highlights: [{ line: 50, narration: "Outside" }],
          }),
        ]),
      ).toThrow(/outside step range/);
    });
  });

  describe("controls", () => {
    test("every state has controls in bubble", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([makeStep()]);
      const show = await pull();
      sut.next("auto");
      const hl = await pull();

      // Assert
      expect(show.bubble?.text).toContain("**Next**");
      expect(hl.bubble?.text).toContain("**Next**");
    });
  });

  describe("status label", () => {
    test("show phase shows step number only", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([makeStep(), makeStep(), makeStep()]);

      // Act
      const state = await pull();

      // Assert
      expect(state.statusLabel).toContain("Step 1/3");
      expect(state.statusLabel).not.toContain("Highlight");
    });

    test("highlight phase shows step and highlight number", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([
        makeStep({
          highlights: [
            { line: 5, narration: "First" },
            { line: 10, narration: "Second" },
            { line: 15, narration: "Third" },
          ],
        }),
      ]);
      await pull(); // show
      sut.next("auto");
      await pull(); // highlight 1
      sut.next("auto");

      // Act
      const state = await pull(); // highlight 2

      // Assert
      expect(state.statusLabel).toContain("Step 1/1");
      expect(state.statusLabel).toContain("Highlight 2/3");
    });

    test("idle phase shows step number only", async () => {
      // Arrange
      const { sut, pull } = makeSUT();
      sut.start([makeStep()]);
      await pull(); // show
      sut.next("auto");
      await pull(); // highlight
      sut.next("auto");

      // Act
      const state = await pull(); // idle

      // Assert
      expect(state.statusLabel).toContain("Step 1/1");
      expect(state.statusLabel).not.toContain("Highlight");
    });
  });
});
