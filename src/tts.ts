import { type ChildProcess, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { logger } from "./utils/logger.js";

let currentProcess: ChildProcess | null = null;
let edgeTts: MsEdgeTTS | null = null;
let edgeTtsDir: string | null = null;
let cachedVoices: { name: string; locale: string; gender: string }[] | null =
  null;

const DEFAULT_VOICE = "en-US-AriaNeural";
const CONFIG_DIR = join(homedir(), ".walkthrough");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

// --- Config persistence ---

interface TtsConfig {
  voice: string;
}

function loadConfig(): TtsConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      if (typeof parsed?.voice === "string") return parsed;
    }
  } catch (err) {
    logger.warn({ err }, "Failed to load TTS config");
  }
  return { voice: DEFAULT_VOICE };
}

function saveConfig(cfg: TtsConfig): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (err) {
    logger.warn({ err }, "Failed to save TTS config");
  }
}

const config = loadConfig();

export function getVoice(): string {
  return config.voice;
}

export function setVoice(voice: string): void {
  config.voice = voice;
  saveConfig(config);
  edgeTts = null;
}

export async function listVoices(): Promise<
  { name: string; locale: string; gender: string }[]
> {
  if (cachedVoices) return cachedVoices;
  const tts = new MsEdgeTTS();
  const voices = await tts.getVoices();
  cachedVoices = voices.map((v: Record<string, string>) => ({
    name: v.ShortName ?? "",
    locale: v.Locale ?? "",
    gender: v.Gender ?? "",
  }));
  return cachedVoices;
}

// --- Markdown stripping ---

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

// --- Process runner (shared by playFile and _speak) ---

function runProcess(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve) => {
    stopSpeaking();

    try {
      const proc = spawn(cmd, args, { stdio: "ignore" });
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

// --- Edge TTS ---

async function getEdgeTts(): Promise<MsEdgeTTS> {
  if (!edgeTts) {
    edgeTts = new MsEdgeTTS();
    await edgeTts.setMetadata(
      config.voice,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    );
    edgeTtsDir = join(tmpdir(), `walkthrough-tts-${process.pid}`);
    mkdirSync(edgeTtsDir, { recursive: true });
  }
  return edgeTts;
}

function getPlayerArgs(filePath: string): [string, string[]] | null {
  if (process.platform === "darwin") return ["afplay", [filePath]];
  if (process.platform === "linux") return ["mpg123", ["-q", filePath]];
  if (process.platform === "win32") {
    const escaped = filePath.replace(/'/g, "''");
    return [
      "powershell",
      [
        "-Command",
        `Add-Type -AssemblyName presentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([Uri]'${escaped}'); $p.Play(); Start-Sleep -Seconds 300`,
      ],
    ];
  }
  return null;
}

async function speakEdgeTts(text: string): Promise<void> {
  const tts = await getEdgeTts();
  if (!edgeTtsDir) throw new Error("Edge TTS dir not initialized");
  const result = await tts.toFile(edgeTtsDir, text);
  const playerArgs = getPlayerArgs(result.audioFilePath);
  if (playerArgs) {
    await runProcess(...playerArgs);
  }
  try {
    rmSync(result.audioFilePath, { force: true });
  } catch {}
}

// --- Native TTS fallback ---

function speakNative(text: string): Promise<void> {
  if (process.platform === "darwin") return runProcess("say", [text]);
  if (process.platform === "linux") return runProcess("espeak", [text]);
  if (process.platform === "win32") {
    const escaped = text.replace(/'/g, "''");
    return runProcess("powershell", [
      "-Command",
      `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${escaped}')`,
    ]);
  }
  return Promise.resolve();
}

// --- Public API ---

export async function speak(text: string): Promise<void> {
  try {
    await speakEdgeTts(text);
  } catch (err) {
    logger.warn({ err }, "Edge TTS failed, falling back to native");
    await speakNative(text);
  }
}

export function _speak(
  text: string,
  cmd: string,
  args: string[],
): Promise<void> {
  return runProcess(cmd, [...args, text]);
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

export function cleanupTts(): void {
  stopSpeaking();
  if (edgeTtsDir) {
    try {
      rmSync(edgeTtsDir, { recursive: true, force: true });
    } catch {}
  }
}
