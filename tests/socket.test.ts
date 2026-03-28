import { describe, expect, test } from "bun:test";
import { discoverSocket, socketPathForDir } from "../src/socket";

describe("socketPathForDir", () => {
  test("returns /tmp path with hash suffix", () => {
    // Arrange
    const dir = "/Users/stefan/Projects/ultidev";

    // Act
    const result = socketPathForDir(dir);

    // Assert
    expect(result).toMatch(/^\/tmp\/walkthrough-bridge-[a-f0-9]+\.sock$/);
  });

  test("returns same path for same directory", () => {
    // Arrange
    const dir = "/Users/stefan/Projects/ultidev";

    // Act & Assert
    expect(socketPathForDir(dir)).toBe(socketPathForDir(dir));
  });

  test("returns different paths for different directories", () => {
    // Arrange
    const dir1 = "/Users/stefan/Projects/ultidev";
    const dir2 = "/Users/stefan/Projects/other";

    // Act & Assert
    expect(socketPathForDir(dir1)).not.toBe(socketPathForDir(dir2));
  });

  test("normalizes trailing slashes", () => {
    // Arrange & Act & Assert
    expect(socketPathForDir("/foo/bar/")).toBe(socketPathForDir("/foo/bar"));
  });
});

describe("discoverSocket", () => {
  test("returns null when no socket exists", () => {
    // Arrange
    const cwd = "/nonexistent/path/that/does/not/exist";

    // Act
    const result = discoverSocket(cwd);

    // Assert
    expect(result).toBeNull();
  });

  test("returns socket path when it exists for exact directory", async () => {
    // Arrange
    const dir = `/tmp/walkthrough-test-${Date.now()}`;
    const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    const socketPath = socketPathForDir(dir);
    writeFileSync(socketPath, "");

    try {
      // Act
      const result = discoverSocket(dir);

      // Assert
      expect(result).toBe(socketPath);
    } finally {
      rmSync(socketPath, { force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("walks up to find socket in parent directory", async () => {
    // Arrange
    const parentDir = `/tmp/walkthrough-test-${Date.now()}`;
    const childDir = `${parentDir}/src/components`;
    const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    mkdirSync(childDir, { recursive: true });
    const socketPath = socketPathForDir(parentDir);
    writeFileSync(socketPath, "");

    try {
      // Act
      const result = discoverSocket(childDir);

      // Assert
      expect(result).toBe(socketPath);
    } finally {
      rmSync(socketPath, { force: true });
      rmSync(parentDir, { recursive: true, force: true });
    }
  });
});
