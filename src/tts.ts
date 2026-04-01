import { type ChildProcess, spawn } from "node:child_process";

let currentProcess: ChildProcess | null = null;

export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function _speak(
  text: string,
  cmd: string,
  args: string[],
): Promise<void> {
  return new Promise((resolve) => {
    stopSpeaking();

    try {
      const proc = spawn(cmd, [...args, text], { stdio: "ignore" });
      currentProcess = proc;

      proc.on("close", () => {
        if (currentProcess === proc) currentProcess = null;
        resolve();
      });

      proc.on("error", () => {
        if (currentProcess === proc) currentProcess = null;
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

export function speak(text: string): Promise<void> {
  if (process.platform === "darwin") return _speak(text, "say", []);
  if (process.platform === "linux") return _speak(text, "espeak", []);
  if (process.platform === "win32") {
    const escaped = text.replace(/'/g, "''");
    return _speak(text, "powershell", [
      "-Command",
      `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${escaped}')`,
    ]);
  }
  return Promise.resolve();
}

export function stopSpeaking(): void {
  if (currentProcess) {
    currentProcess.kill();
    currentProcess = null;
  }
}

export function isSpeaking(): boolean {
  return currentProcess !== null;
}
