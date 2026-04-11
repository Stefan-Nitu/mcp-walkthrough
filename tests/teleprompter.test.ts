import { describe, expect, it } from "bun:test";
import {
  buildFinalText,
  buildTeleprompterText,
} from "../vscode-extension/src/teleprompter";

describe("buildTeleprompterText", () => {
  it("bolds the active part", () => {
    // Arrange
    const parts = ["Intro text.", "First highlight.", "Second highlight."];

    // Act
    const result = buildTeleprompterText(parts, 1);

    // Assert
    expect(result).toBe(
      "Intro text.\n\n**First highlight.**\n\nSecond highlight.",
    );
  });

  it("bolds the last part when active", () => {
    // Arrange
    const parts = ["Intro.", "Highlight one.", "Highlight two."];

    // Act
    const result = buildTeleprompterText(parts, 2);

    // Assert
    expect(result).toBe("Intro.\n\nHighlight one.\n\n**Highlight two.**");
  });

  it("bolds the intro when active index is 0", () => {
    // Arrange
    const parts = ["Intro.", "Detail."];

    // Act
    const result = buildTeleprompterText(parts, 0);

    // Assert
    expect(result).toBe("**Intro.**\n\nDetail.");
  });

  it("handles single part", () => {
    // Arrange / Act
    const result = buildTeleprompterText(["Only part."], 0);

    // Assert
    expect(result).toBe("**Only part.**");
  });
});

describe("buildFinalText", () => {
  it("joins all parts without bold and appends controls", () => {
    // Arrange
    const parts = ["Intro.", "First.", "Second."];
    const controls = "\n\n---\nNext | Prev | Stop";

    // Act
    const result = buildFinalText(parts, controls);

    // Assert
    expect(result).toBe(
      "Intro.\n\nFirst.\n\nSecond.\n\n---\nNext | Prev | Stop",
    );
  });

  it("works with single part", () => {
    // Arrange / Act
    const result = buildFinalText(["Only."], " [controls]");

    // Assert
    expect(result).toBe("Only. [controls]");
  });
});
