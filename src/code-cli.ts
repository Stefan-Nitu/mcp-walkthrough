import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CLI_NAMES = ["code", "code-insiders", "cursor"];

function safeListDir(
  listDir: (path: string) => string[],
  path: string,
): string[] {
  try {
    return listDir(path);
  } catch {
    return [];
  }
}

export function _findAllCodeClis(
  platform: NodeJS.Platform,
  findInPath: (name: string) => string | null,
  fileExists: (path: string) => boolean,
  listDir: (path: string) => string[],
  localAppData?: string,
): string[] {
  const found: string[] = [];

  for (const name of CLI_NAMES) {
    const p = findInPath(name);
    if (p) found.push(p);
  }

  if (platform === "darwin") {
    for (const entry of safeListDir(listDir, "/Applications")) {
      if (!entry.endsWith(".app")) continue;
      for (const name of CLI_NAMES) {
        const bin = join(
          "/Applications",
          entry,
          "Contents",
          "Resources",
          "app",
          "bin",
          name,
        );
        if (fileExists(bin)) found.push(bin);
      }
    }
  }

  if (platform === "linux") {
    for (const dir of ["/usr/bin", "/usr/local/bin", "/snap/bin"]) {
      for (const name of CLI_NAMES) {
        const bin = join(dir, name);
        if (fileExists(bin)) found.push(bin);
      }
    }
    for (const entry of safeListDir(listDir, "/opt")) {
      for (const name of CLI_NAMES) {
        const bin = join("/opt", entry, "bin", name);
        if (fileExists(bin)) found.push(bin);
      }
    }
  }

  if (platform === "win32") {
    const appData =
      localAppData ||
      process.env.LOCALAPPDATA ||
      join(homedir(), "AppData", "Local");
    const programsDir = join(appData, "Programs");
    for (const entry of safeListDir(listDir, programsDir)) {
      for (const name of CLI_NAMES) {
        const std = join(programsDir, entry, "bin", `${name}.cmd`);
        if (fileExists(std)) found.push(std);
        const electron = join(
          programsDir,
          entry,
          "resources",
          "app",
          "bin",
          `${name}.cmd`,
        );
        if (fileExists(electron)) found.push(electron);
      }
    }
  }

  return [...new Set(found)];
}

function defaultFindInPath(name: string): string | null {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    return (
      execSync(`${cmd} ${name}`, { encoding: "utf-8", stdio: "pipe" }).trim() ||
      null
    );
  } catch {
    return null;
  }
}

let cached: string[] | undefined;

export function resolveAllCodeClis(): string[] {
  if (cached !== undefined) return cached;
  cached = _findAllCodeClis(
    process.platform,
    defaultFindInPath,
    existsSync,
    (p) => readdirSync(p),
  );
  return cached;
}

export function resetCodeCliCache(): void {
  cached = undefined;
}
