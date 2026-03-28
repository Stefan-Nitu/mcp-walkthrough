import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const SOCKET_DIR = "/tmp";
const SOCKET_PREFIX = "walkthrough-bridge-";

export function socketPathForDir(dir: string): string {
  const normalized = dir.replace(/\/+$/, "");
  const hash = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 16);
  return join(SOCKET_DIR, `${SOCKET_PREFIX}${hash}.sock`);
}

export function discoverSocket(cwd: string = process.cwd()): string | null {
  let dir = cwd;
  while (true) {
    const socketPath = socketPathForDir(dir);
    if (existsSync(socketPath)) {
      return socketPath;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
