import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const POSTINSTALL = join(import.meta.dir, "..", "scripts", "postinstall.cjs");
const NODE_BIN = execSync("which node", { encoding: "utf-8" }).trim();
const NODE_DIR = dirname(NODE_BIN);

describe("postinstall integration", () => {
  const tmpDir = `/tmp/postinstall-test-${process.pid}`;
  const fakeBinDir = join(tmpDir, "bin");
  const logFile = join(tmpDir, "calls.log");

  const vsixPath = join(
    import.meta.dir,
    "..",
    "vscode-extension",
    "walkthrough-bridge.vsix",
  );
  let vsixExisted: boolean;

  beforeEach(() => {
    mkdirSync(fakeBinDir, { recursive: true });
    const fakeCode = `#!/bin/sh\necho "$@" >> "${logFile}"`;
    writeFileSync(join(fakeBinDir, "code"), fakeCode);
    chmodSync(join(fakeBinDir, "code"), 0o755);

    // Ensure VSIX exists so postinstall doesn't exit early
    vsixExisted = existsSync(vsixPath);
    if (!vsixExisted) {
      mkdirSync(dirname(vsixPath), { recursive: true });
      writeFileSync(vsixPath, "");
    }
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (!vsixExisted) rmSync(vsixPath, { force: true });
  });

  test("calls CLI with --install-extension and --force when found in PATH", () => {
    // Act
    execSync(`"${NODE_BIN}" "${POSTINSTALL}"`, {
      encoding: "utf-8",
      env: { ...process.env, PATH: `${fakeBinDir}:${NODE_DIR}:/usr/bin:/bin` },
    });

    // Assert
    const log = readFileSync(logFile, "utf-8").trim();
    expect(log).toContain("--install-extension");
    expect(log).toContain("walkthrough-bridge.vsix");
    expect(log).toContain("--force");
  }, 15_000);

  test("exits 0 and skips CLI when vsix is missing", () => {
    // Arrange
    const isolatedDir = join(tmpDir, "scripts");
    mkdirSync(isolatedDir, { recursive: true });
    writeFileSync(
      join(isolatedDir, "postinstall.cjs"),
      readFileSync(POSTINSTALL, "utf-8"),
    );

    // Act
    execSync(`"${NODE_BIN}" "${join(isolatedDir, "postinstall.cjs")}"`, {
      encoding: "utf-8",
      env: { ...process.env, PATH: `${fakeBinDir}:${NODE_DIR}:/usr/bin:/bin` },
    });

    // Assert
    expect(existsSync(logFile)).toBe(false);
  });

  test("exits 0 when no CLI is available", () => {
    // Act + Assert — no throw means exit code 0
    execSync(`"${NODE_BIN}" "${POSTINSTALL}"`, {
      encoding: "utf-8",
      env: { ...process.env, PATH: `${NODE_DIR}:/usr/bin:/bin` },
    });
  });
});
