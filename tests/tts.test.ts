import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { _speak, stopSpeaking, stripMarkdown } from "../src/tts";

describe("stripMarkdown", () => {
  test("strips bold markers", () => {
    expect(stripMarkdown("This is **bold** text")).toBe("This is bold text");
  });

  test("strips italic markers", () => {
    expect(stripMarkdown("This is *italic* text")).toBe("This is italic text");
  });

  test("strips inline code backticks", () => {
    expect(stripMarkdown("Use `const x = 1` here")).toBe(
      "Use const x = 1 here",
    );
  });

  test("removes code blocks entirely", () => {
    expect(stripMarkdown("Before\n```js\nconst x = 1;\n```\nAfter")).toBe(
      "Before\n\nAfter",
    );
  });

  test("strips link syntax keeping text", () => {
    expect(stripMarkdown("[click here](http://example.com)")).toBe(
      "click here",
    );
  });

  test("strips header markers", () => {
    expect(stripMarkdown("## Title\nContent")).toBe("Title\nContent");
  });

  test("strips list markers", () => {
    expect(stripMarkdown("- Item 1\n- Item 2")).toBe("Item 1\nItem 2");
  });

  test("strips numbered list markers", () => {
    expect(stripMarkdown("1. First\n2. Second")).toBe("First\nSecond");
  });

  test("strips blockquote markers", () => {
    expect(stripMarkdown("> Quote here")).toBe("Quote here");
  });

  test("handles mixed markdown", () => {
    // Arrange
    const input =
      "**Overview**\n\nThis validates the `JWT` token.\n\n- Check [docs](url) for details";

    // Act
    const result = stripMarkdown(input);

    // Assert
    expect(result).toBe(
      "Overview\n\nThis validates the JWT token.\n\nCheck docs for details",
    );
  });

  test("collapses excessive newlines", () => {
    expect(stripMarkdown("A\n\n\n\nB")).toBe("A\n\nB");
  });

  test("returns empty string for empty input", () => {
    expect(stripMarkdown("")).toBe("");
  });

  test("returns plain text unchanged", () => {
    expect(stripMarkdown("Just plain text")).toBe("Just plain text");
  });
});

describe("_speak", () => {
  const tmpDir = `/tmp/tts-test-${process.pid}`;
  const logFile = join(tmpDir, "spoken.txt");

  afterEach(() => {
    stopSpeaking();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("passes text as argument to TTS command", async () => {
    // Arrange
    mkdirSync(tmpDir, { recursive: true });
    const fakeTts = join(tmpDir, "fake-say");
    writeFileSync(fakeTts, `#!/bin/sh\necho "$1" > "${logFile}"`);
    chmodSync(fakeTts, 0o755);

    // Act
    await _speak("Hello world", fakeTts, []);

    // Assert
    const spoken = readFileSync(logFile, "utf-8").trim();
    expect(spoken).toBe("Hello world");
  });

  test("resolves when TTS process exits", async () => {
    // Arrange
    mkdirSync(tmpDir, { recursive: true });
    const fakeTts = join(tmpDir, "fake-say");
    writeFileSync(fakeTts, "#!/bin/sh\ntrue");
    chmodSync(fakeTts, 0o755);

    // Act + Assert
    await _speak("Test", fakeTts, []);
  });

  test("resolves on TTS process error", async () => {
    // Act + Assert — nonexistent binary should resolve, not reject
    await _speak("Test", "/nonexistent/binary", []);
  });

  test("stopSpeaking kills running process", async () => {
    // Arrange
    mkdirSync(tmpDir, { recursive: true });
    const fakeTts = join(tmpDir, "fake-say");
    writeFileSync(fakeTts, "#!/bin/sh\nsleep 60");
    chmodSync(fakeTts, 0o755);

    // Act
    const promise = _speak("Long text", fakeTts, []);
    stopSpeaking();

    // Assert
    await promise;
  });
});
