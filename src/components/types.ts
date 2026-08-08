import type { ConversationPattern } from "../content/schema";

export type DisplayMode =
  | "all"
  | "hide-english"
  | "hide-korean"
  | "listening";

export type GridDensity = "large" | "comfortable" | "compact" | "overview";
export type AppView = "home" | "grid" | "random";

export interface PatternProgressView {
  mastery: number;
  isNew?: boolean;
}

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

export interface FilterState {
  query: string;
  categoryIds: string[];
  situationIds: string[];
  cefr: string[];
  register: string[];
  mastery: string[];
  favoritesOnly: boolean;
  newOnly: boolean;
}

export interface ToastItem {
  id: string;
  message: string;
  tone?: "neutral" | "success" | "warning" | "error";
  actionLabel?: string;
  onAction?: () => void;
}

export interface ListeningSettings {
  voiceId: string;
  rate: number;
  pitch: number;
  volume: number;
  autoScroll: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
}

export interface VoiceOption {
  id: string;
  label: string;
  lang?: string;
}

export interface PatternActionProps {
  onSpeak: (pattern: ConversationPattern) => void;
  onOpenDetails?: (pattern: ConversationPattern) => void;
}

export const EMPTY_FILTERS: Readonly<FilterState> = Object.freeze({
  query: "",
  categoryIds: [],
  situationIds: [],
  cefr: [],
  register: [],
  mastery: [],
  favoritesOnly: false,
  newOnly: false,
});
