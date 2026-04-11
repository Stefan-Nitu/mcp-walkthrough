import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".walkthrough");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export interface WalkthroughConfig {
  voice: string;
  voiceEnabled: boolean;
  showBubbles: boolean;
  autoplay: boolean;
  autoplayDelay: number;
}

const DEFAULTS: WalkthroughConfig = {
  voice: "en-US-MichelleNeural",
  voiceEnabled: true,
  showBubbles: true,
  autoplay: true,
  autoplayDelay: 0,
};

const config: WalkthroughConfig = load();

function load(): WalkthroughConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      if (typeof parsed?.voice === "string") {
        return { ...DEFAULTS, ...parsed };
      }
    }
  } catch {}
  return { ...DEFAULTS };
}

function save(): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch {}
}

export function getConfig(): WalkthroughConfig {
  return { ...config };
}

export function updateConfig(opts: Partial<WalkthroughConfig>): void {
  if (opts.voice !== undefined) config.voice = opts.voice;
  if (opts.voiceEnabled !== undefined) config.voiceEnabled = opts.voiceEnabled;
  if (opts.showBubbles !== undefined) config.showBubbles = opts.showBubbles;
  if (opts.autoplay !== undefined) config.autoplay = opts.autoplay;
  if (opts.autoplayDelay !== undefined)
    config.autoplayDelay = opts.autoplayDelay;
  save();
}
