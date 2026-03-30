import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { _findAllCodeClis } from "../src/code-cli";

const noPath = () => null;
const noFile = () => false;
const noDir = () => [] as string[];

describe("_findAllCodeClis", () => {
  describe("PATH lookup", () => {
    test("finds code in PATH", () => {
      // Arrange
      const findInPath = (name: string) =>
        name === "code" ? "/usr/local/bin/code" : null;

      // Act
      const result = _findAllCodeClis("darwin", findInPath, noFile, noDir);

      // Assert
      expect(result).toContain("/usr/local/bin/code");
    });

    test("finds multiple CLIs in PATH", () => {
      // Arrange
      const bins: Record<string, string> = {
        code: "/usr/local/bin/code",
        cursor: "/usr/local/bin/cursor",
      };
      const findInPath = (name: string) => bins[name] ?? null;

      // Act
      const result = _findAllCodeClis("darwin", findInPath, noFile, noDir);

      // Assert
      expect(result).toContain("/usr/local/bin/code");
      expect(result).toContain("/usr/local/bin/cursor");
    });
  });

  describe("combines PATH and filesystem search", () => {
    test("finds cursor in PATH and VS Code in /Applications", () => {
      // Arrange
      const findInPath = (name: string) =>
        name === "cursor" ? "/usr/local/bin/cursor" : null;
      const vscodeBin =
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
      const fileExists = (p: string) => p === vscodeBin;
      const listDir = (p: string) =>
        p === "/Applications" ? ["Visual Studio Code.app", "Cursor.app"] : [];

      // Act
      const result = _findAllCodeClis(
        "darwin",
        findInPath,
        fileExists,
        listDir,
      );

      // Assert
      expect(result).toContain("/usr/local/bin/cursor");
      expect(result).toContain(vscodeBin);
    });
  });

  describe("deduplicates results", () => {
    test("does not return same CLI twice from PATH and filesystem", () => {
      // Arrange
      const vscodeBin =
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
      const findInPath = (name: string) => (name === "code" ? vscodeBin : null);
      const fileExists = (p: string) => p === vscodeBin;
      const listDir = (p: string) =>
        p === "/Applications" ? ["Visual Studio Code.app"] : [];

      // Act
      const result = _findAllCodeClis(
        "darwin",
        findInPath,
        fileExists,
        listDir,
      );

      // Assert
      expect(result).toEqual([vscodeBin]);
    });
  });

  describe("macOS search", () => {
    test("finds VS Code in /Applications", () => {
      // Arrange
      const vscodeBin =
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
      const fileExists = (p: string) => p === vscodeBin;
      const listDir = (p: string) =>
        p === "/Applications" ? ["Visual Studio Code.app", "Safari.app"] : [];

      // Act
      const result = _findAllCodeClis("darwin", noPath, fileExists, listDir);

      // Assert
      expect(result).toEqual([vscodeBin]);
    });

    test("finds multiple editors in /Applications", () => {
      // Arrange
      const vscodeBin =
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
      const cursorBin =
        "/Applications/Cursor.app/Contents/Resources/app/bin/cursor";
      const fileExists = (p: string) => p === vscodeBin || p === cursorBin;
      const listDir = (p: string) =>
        p === "/Applications"
          ? ["Visual Studio Code.app", "Cursor.app", "Safari.app"]
          : [];

      // Act
      const result = _findAllCodeClis("darwin", noPath, fileExists, listDir);

      // Assert
      expect(result).toContain(vscodeBin);
      expect(result).toContain(cursorBin);
    });

    test("skips non-.app entries in /Applications", () => {
      // Arrange
      const listDir = (p: string) =>
        p === "/Applications" ? ["SomeFolder", "readme.txt"] : [];

      // Act
      const result = _findAllCodeClis("darwin", noPath, noFile, listDir);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("Linux search", () => {
    test("finds code in /usr/bin", () => {
      // Arrange
      const fileExists = (p: string) => p === "/usr/bin/code";

      // Act
      const result = _findAllCodeClis("linux", noPath, fileExists, noDir);

      // Assert
      expect(result).toEqual(["/usr/bin/code"]);
    });

    test("finds cursor in /opt subdirectory", () => {
      // Arrange
      const fileExists = (p: string) => p === "/opt/cursor/bin/cursor";
      const listDir = (p: string) =>
        p === "/opt" ? ["cursor", "other-app"] : [];

      // Act
      const result = _findAllCodeClis("linux", noPath, fileExists, listDir);

      // Assert
      expect(result).toEqual(["/opt/cursor/bin/cursor"]);
    });
  });

  describe("Windows search", () => {
    test("finds code.cmd in standard Programs layout", () => {
      // Arrange
      const appData = "C:/Users/test/AppData/Local";
      const expected = join(
        appData,
        "Programs",
        "Microsoft VS Code",
        "bin",
        "code.cmd",
      );
      const fileExists = (p: string) => p === expected;
      const listDir = (p: string) =>
        p === join(appData, "Programs")
          ? ["Microsoft VS Code", "Other App"]
          : [];

      // Act
      const result = _findAllCodeClis(
        "win32",
        noPath,
        fileExists,
        listDir,
        appData,
      );

      // Assert
      expect(result).toEqual([expected]);
    });
  });

  describe("no CLI found", () => {
    test("returns empty array when nothing found", () => {
      // Act
      const result = _findAllCodeClis("darwin", noPath, noFile, noDir);

      // Assert
      expect(result).toEqual([]);
    });

    test("returns empty array for unknown platform", () => {
      // Act
      const result = _findAllCodeClis(
        "freebsd" as NodeJS.Platform,
        noPath,
        noFile,
        noDir,
      );

      // Assert
      expect(result).toEqual([]);
    });
  });
});
