const { execSync } = require("node:child_process");
const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const vsixPath = join(
  __dirname,
  "..",
  "vscode-extension",
  "walkthrough-bridge.vsix",
);
if (!existsSync(vsixPath)) process.exit(0);

const cliNames = ["code", "code-insiders", "cursor"];
const whichCmd = process.platform === "win32" ? "where" : "which";

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const found = [];

for (const name of cliNames) {
  try {
    const p = execSync(`${whichCmd} ${name}`, {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    if (p) found.push(p);
  } catch {}
}

if (process.platform === "darwin") {
  for (const entry of safeReaddir("/Applications")) {
    if (!entry.endsWith(".app")) continue;
    for (const name of cliNames) {
      const bin = join(
        "/Applications",
        entry,
        "Contents",
        "Resources",
        "app",
        "bin",
        name,
      );
      if (existsSync(bin)) found.push(bin);
    }
  }
}

if (process.platform === "linux") {
  for (const dir of ["/usr/bin", "/usr/local/bin", "/snap/bin"]) {
    for (const name of cliNames) {
      const bin = join(dir, name);
      if (existsSync(bin)) found.push(bin);
    }
  }
  for (const entry of safeReaddir("/opt")) {
    for (const name of cliNames) {
      const bin = join("/opt", entry, "bin", name);
      if (existsSync(bin)) found.push(bin);
    }
  }
}

if (process.platform === "win32") {
  const appData =
    process.env.LOCALAPPDATA ||
    join(require("node:os").homedir(), "AppData", "Local");
  const programsDir = join(appData, "Programs");
  for (const entry of safeReaddir(programsDir)) {
    for (const name of cliNames) {
      const std = join(programsDir, entry, "bin", `${name}.cmd`);
      if (existsSync(std)) found.push(std);
      const electron = join(
        programsDir,
        entry,
        "resources",
        "app",
        "bin",
        `${name}.cmd`,
      );
      if (existsSync(electron)) found.push(electron);
    }
  }
}

const unique = [...new Set(found)];
for (const cli of unique) {
  try {
    execSync(`"${cli}" --install-extension "${vsixPath}" --force`, {
      stdio: "ignore",
    });
  } catch {}
}
