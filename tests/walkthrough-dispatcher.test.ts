import { describe, expect, test } from "bun:test";
import { WalkthroughDispatcherUseCase } from "../src/use-cases/walkthrough-dispatcher";

function makeSUT() {
  const sut = new WalkthroughDispatcherUseCase();
  return { sut };
}

describe("WalkthroughDispatcherUseCase", () => {
  describe("getStatus — empty args return current walkthrough state", () => {
    test("empty args returns getStatus", () => {
      // Arrange
      const { sut } = makeSUT();
      const input = {};

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({ type: "getStatus" });
    });
  });

  describe("clear — action 'clear' removes all bubbles", () => {
    test("action 'clear' returns clear dispatch", () => {
      // Arrange
      const { sut } = makeSUT();
      const input = { action: "clear" as const };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({ type: "clear" });
    });
  });

  describe("navigate — actions control an active tour", () => {
    test.each([
      "next",
      "prev",
      "stop",
      "pause",
      "resume",
    ] as const)("action '%s' returns navigate dispatch", (action) => {
      // Arrange
      const { sut } = makeSUT();
      const input = { action };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({ type: "navigate", action });
    });

    test("action 'goto' with step returns navigate dispatch with step", () => {
      // Arrange
      const { sut } = makeSUT();
      const input = { action: "goto" as const, step: 2 };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({ type: "navigate", action: "goto", step: 2 });
    });

    test("action 'goto' without step still returns navigate dispatch", () => {
      // Arrange
      const { sut } = makeSUT();
      const input = { action: "goto" as const };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({ type: "navigate", action: "goto" });
    });
  });

  describe("singleExplain — 1 step with explanation shows an inline bubble", () => {
    test("single step with explanation returns singleExplain", () => {
      // Arrange
      const { sut } = makeSUT();
      const step = {
        file: "/test.ts",
        line: 1,
        endLine: 5,
        explanation: "does X",
      };
      const input = { steps: [step] };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({ type: "singleExplain", step });
    });
  });

  describe("highlightOnly — 1 step without explanation just highlights", () => {
    test("single step without explanation returns highlightOnly", () => {
      // Arrange
      const { sut } = makeSUT();
      const input = {
        steps: [{ file: "/test.ts", line: 1, endLine: 5 }],
      };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({
        type: "highlightOnly",
        file: "/test.ts",
        line: 1,
        endLine: 5,
      });
    });

    test("single step without explanation preserves char offsets", () => {
      // Arrange
      const { sut } = makeSUT();
      const input = {
        steps: [
          {
            file: "/test.ts",
            line: 1,
            endLine: 1,
            startChar: 2,
            endChar: 10,
          },
        ],
      };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({
        type: "highlightOnly",
        file: "/test.ts",
        line: 1,
        endLine: 1,
        startChar: 2,
        endChar: 10,
      });
    });
  });

  describe("startWalkthrough — 2+ steps start a narrated tour", () => {
    test("multiple steps returns startWalkthrough", () => {
      // Arrange
      const { sut } = makeSUT();
      const steps = [
        { file: "/a.ts", line: 1, explanation: "step 1" },
        { file: "/b.ts", line: 1, explanation: "step 2" },
      ];
      const input = { steps };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({ type: "startWalkthrough", steps });
    });
  });

  describe("precedence — steps beat action, empty arrays fall through", () => {
    test("steps and action both provided: steps wins", () => {
      // Arrange
      const { sut } = makeSUT();
      const step = { file: "/a.ts", line: 1, explanation: "x" };
      const input = { steps: [step], action: "clear" as const };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({ type: "singleExplain", step });
    });

    test("empty steps array falls through to action", () => {
      // Arrange
      const { sut } = makeSUT();
      const input = { steps: [], action: "clear" as const };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({ type: "clear" });
    });

    test("empty steps array with no action falls through to getStatus", () => {
      // Arrange
      const { sut } = makeSUT();
      const input = { steps: [] };

      // Act
      const result = sut.execute(input);

      // Assert
      expect(result).toEqual({ type: "getStatus" });
    });
  });
});
