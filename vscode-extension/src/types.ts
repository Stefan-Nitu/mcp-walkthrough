export interface WalkthroughHighlight {
  line: number;
  endLine?: number;
  narration: string;
}

export interface WalkthroughStep {
  file: string;
  line: number;
  endLine?: number;
  explanation: string;
  title?: string;
  highlights?: WalkthroughHighlight[];
}

export interface WalkthroughConfig {
  voice: string;
  voiceEnabled: boolean;
  autoplay: boolean;
}

export type NavigateAction =
  | "next"
  | "prev"
  | "stop"
  | "pause"
  | "resume"
  | "goto";
