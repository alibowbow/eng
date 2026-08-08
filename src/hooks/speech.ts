export type SpeechStatus = 'idle' | 'speaking' | 'paused' | 'unsupported' | 'error';
export type SpeechResult = 'ended' | 'cancelled' | 'unsupported' | 'error';

export interface TtsSettings {
  voiceURI: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
}

export interface SpeechRequest {
  text: string;
  lang?: string;
  audioUrl?: string;
  slowAudioUrl?: string;
  preferSlowAudio?: boolean;
  settings?: Partial<TtsSettings>;
}

export interface SpeechSnapshot {
  voices: readonly SpeechSynthesisVoice[];
  settings: Readonly<TtsSettings>;
  status: SpeechStatus;
  currentText: string;
  error: string | null;
  isSupported: boolean;
}

export interface SpeechSynthesisLike {
  getVoices(): SpeechSynthesisVoice[];
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  addEventListener?(type: 'voiceschanged', listener: EventListener): void;
  removeEventListener?(type: 'voiceschanged', listener: EventListener): void;
}

export interface PlayableAudio {
  currentTime: number;
  playbackRate: number;
  volume: number;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: 'ended' | 'error', listener: EventListener, options?: AddEventListenerOptions): void;
  removeEventListener(type: 'ended' | 'error', listener: EventListener): void;
}

export interface SpeechEnvironment {
  synthesis?: SpeechSynthesisLike | null;
  createUtterance?: ((text: string) => SpeechSynthesisUtterance) | null;
  createAudio?: ((url: string) => PlayableAudio) | null;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

export const TTS_SETTINGS_STORAGE_KEY = 'saygrid:tts-settings:v1';

export const DEFAULT_TTS_SETTINGS: Readonly<TtsSettings> = Object.freeze({
  voiceURI: '',
  lang: 'en-US',
  rate: 1,
  pitch: 1,
  volume: 1,
});

export const TTS_RATE_PRESETS = Object.freeze({
  verySlow: 0.55,
  slow: 0.75,
  normal: 1,
  natural: 1.08,
} as const);

export type TtsRatePreset = keyof typeof TTS_RATE_PRESETS;

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

export function sanitizeTtsSettings(value: Partial<TtsSettings> | null | undefined): TtsSettings {
  const lang = typeof value?.lang === 'string' && value.lang.trim() ? value.lang.trim() : DEFAULT_TTS_SETTINGS.lang;
  return {
    voiceURI: typeof value?.voiceURI === 'string' ? value.voiceURI : '',
    lang,
    rate: clamp(value?.rate, 0.35, 2, DEFAULT_TTS_SETTINGS.rate),
    pitch: clamp(value?.pitch, 0, 2, DEFAULT_TTS_SETTINGS.pitch),
    volume: clamp(value?.volume, 0, 1, DEFAULT_TTS_SETTINGS.volume),
  };
}

function readStoredSettings(storage: SpeechEnvironment['storage']): TtsSettings {
  if (!storage) return { ...DEFAULT_TTS_SETTINGS };
  try {
    const raw = storage.getItem(TTS_SETTINGS_STORAGE_KEY);
    return raw ? sanitizeTtsSettings(JSON.parse(raw) as Partial<TtsSettings>) : { ...DEFAULT_TTS_SETTINGS };
  } catch {
    return { ...DEFAULT_TTS_SETTINGS };
  }
}

export interface VoicePreference {
  voiceURI?: string;
  lang?: string;
}

/** Pick an exact saved voice first, then an exact accent, then any English voice. */
export function selectBestVoice(
  voices: readonly SpeechSynthesisVoice[],
  preference: VoicePreference = {},
): SpeechSynthesisVoice | undefined {
  if (!voices.length) return undefined;
  if (preference.voiceURI) {
    const saved = voices.find((voice) => voice.voiceURI === preference.voiceURI);
    const requestedLanguage = preference.lang?.split('-')[0].toLocaleLowerCase();
    const savedLanguage = saved?.lang.split('-')[0].toLocaleLowerCase();
    if (saved && (!requestedLanguage || requestedLanguage === savedLanguage)) return saved;
  }

  const preferredLang = (preference.lang || 'en-US').toLocaleLowerCase();
  const preferredBase = preferredLang.split('-')[0];
  return [...voices]
    .map((voice, index) => {
      const voiceLang = voice.lang.toLocaleLowerCase();
      let score = 0;
      if (voiceLang === preferredLang) score += 500;
      else if (voiceLang.startsWith(`${preferredBase}-`) || voiceLang === preferredBase) score += 300;
      if (voiceLang.startsWith('en')) score += 100;
      if (voice.default) score += 20;
      if (voice.localService) score += 5;
      return { voice, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.voice;
}

function browserEnvironment(): Required<Pick<SpeechEnvironment, 'synthesis' | 'createUtterance' | 'createAudio' | 'storage'>> {
  const synthesis = typeof window !== 'undefined' && 'speechSynthesis' in window
    ? (window.speechSynthesis as SpeechSynthesisLike)
    : null;
  const createUtterance = typeof SpeechSynthesisUtterance !== 'undefined'
    ? (text: string) => new SpeechSynthesisUtterance(text)
    : null;
  const createAudio = typeof Audio !== 'undefined'
    ? (url: string) => new Audio(url) as PlayableAudio
    : null;
  let storage: Storage | null = null;
  try {
    storage = typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    storage = null;
  }
  return { synthesis, createUtterance, createAudio, storage };
}

/** One queue for the whole app prevents overlapping speech across cards. */
export class SpeechService {
  private readonly synthesis: SpeechSynthesisLike | null;
  private readonly createUtterance: ((text: string) => SpeechSynthesisUtterance) | null;
  private readonly createAudio: ((url: string) => PlayableAudio) | null;
  private readonly storage: SpeechEnvironment['storage'];
  private settings: TtsSettings;
  private voices: SpeechSynthesisVoice[] = [];
  private status: SpeechStatus = 'idle';
  private currentText = '';
  private error: string | null = null;
  private activeAudio: PlayableAudio | null = null;
  private settleActive: ((result: SpeechResult) => void) | null = null;
  private generation = 0;
  private listeners = new Set<(snapshot: SpeechSnapshot) => void>();
  private voiceRefreshTimers: Array<ReturnType<typeof setTimeout>> = [];

  private readonly handleVoicesChanged = () => {
    this.refreshVoices();
  };

  constructor(environment: SpeechEnvironment = {}) {
    const browser = browserEnvironment();
    this.synthesis = environment.synthesis === undefined ? browser.synthesis : environment.synthesis;
    this.createUtterance = environment.createUtterance === undefined ? browser.createUtterance : environment.createUtterance;
    this.createAudio = environment.createAudio === undefined ? browser.createAudio : environment.createAudio;
    this.storage = environment.storage === undefined ? browser.storage : environment.storage;
    this.settings = readStoredSettings(this.storage);
    this.refreshVoices(false);
    this.synthesis?.addEventListener?.('voiceschanged', this.handleVoicesChanged as EventListener);
    if (this.synthesis && this.voices.length === 0) {
      this.voiceRefreshTimers = [0, 250, 1_000].map((delay) => setTimeout(() => this.refreshVoices(), delay));
    }
  }

  getSnapshot(): SpeechSnapshot {
    return {
      voices: this.voices,
      settings: this.settings,
      status: this.status,
      currentText: this.currentText,
      error: this.error,
      isSupported: Boolean((this.synthesis && this.createUtterance) || this.createAudio),
    };
  }

  subscribe(listener: (snapshot: SpeechSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  refreshVoices(emit = true): readonly SpeechSynthesisVoice[] {
    try {
      this.voices = this.synthesis?.getVoices() ?? [];
    } catch {
      this.voices = [];
    }
    if (emit) this.emit();
    return this.voices;
  }

  updateSettings(partial: Partial<TtsSettings>): TtsSettings {
    this.settings = sanitizeTtsSettings({ ...this.settings, ...partial });
    try {
      this.storage?.setItem(TTS_SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Private browsing or a full quota must not disable TTS.
    }
    this.emit();
    return this.settings;
  }

  async speak(request: SpeechRequest): Promise<SpeechResult> {
    this.cancel();
    const text = request.text.trim();
    if (!text) return 'ended';
    const generation = this.generation;
    const settings = sanitizeTtsSettings({ ...this.settings, ...request.settings, lang: request.lang ?? request.settings?.lang ?? this.settings.lang });
    this.currentText = text;
    this.error = null;
    this.status = 'speaking';
    this.emit();

    const usesSlowRecording = Boolean(request.preferSlowAudio && request.slowAudioUrl);
    const audioUrl = usesSlowRecording
      ? request.slowAudioUrl
      : request.audioUrl ?? request.slowAudioUrl;
    if (audioUrl && this.createAudio) {
      const audioResult = await this.playAudio(
        audioUrl,
        usesSlowRecording ? { ...settings, rate: 1 } : settings,
        generation,
      );
      if (audioResult !== 'error' || generation !== this.generation) return audioResult;
      // A missing/offline recording quietly falls back to browser TTS.
      this.status = 'speaking';
      this.error = null;
      this.emit();
    }

    if (!this.synthesis || !this.createUtterance) {
      return this.finish(generation, 'unsupported', '이 브라우저에서는 음성 재생을 사용할 수 없습니다.');
    }
    return this.playSynthesis(text, settings, generation);
  }

  private playAudio(url: string, settings: TtsSettings, generation: number): Promise<SpeechResult> {
    return new Promise((resolve) => {
      let audio: PlayableAudio;
      try {
        audio = this.createAudio!(url);
      } catch {
        resolve('error');
        return;
      }
      this.activeAudio = audio;
      audio.volume = settings.volume;
      audio.playbackRate = settings.rate;

      const cleanup = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        if (this.activeAudio === audio) this.activeAudio = null;
        if (this.settleActive === settle) this.settleActive = null;
      };
      const settle = (result: SpeechResult) => {
        cleanup();
        resolve(result === 'ended' ? this.finish(generation, result) : result);
      };
      const onEnded = () => settle('ended');
      const onError = () => settle('error');
      this.settleActive = settle;
      audio.addEventListener('ended', onEnded as EventListener, { once: true });
      audio.addEventListener('error', onError as EventListener, { once: true });
      try {
        const playing = audio.play();
        if (playing && typeof playing.catch === 'function') playing.catch(onError);
      } catch {
        onError();
      }
    });
  }

  private playSynthesis(text: string, settings: TtsSettings, generation: number): Promise<SpeechResult> {
    return new Promise((resolve) => {
      let utterance: SpeechSynthesisUtterance;
      try {
        utterance = this.createUtterance!(text);
      } catch {
        resolve(this.finish(generation, 'error', '음성 재생을 시작하지 못했습니다.'));
        return;
      }
      utterance.lang = settings.lang;
      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;
      utterance.volume = settings.volume;
      utterance.voice = selectBestVoice(this.voices, settings) ?? null;

      const settle = (result: SpeechResult, message?: string) => {
        if (this.settleActive === settle) this.settleActive = null;
        resolve(this.finish(generation, result, message));
      };
      this.settleActive = settle;
      utterance.onend = () => settle('ended');
      utterance.onerror = (event) => {
        const reason = 'error' in event ? String(event.error) : '';
        settle(reason === 'canceled' || reason === 'interrupted' ? 'cancelled' : 'error', reason || '음성 재생 중 오류가 발생했습니다.');
      };
      try {
        this.synthesis!.speak(utterance);
      } catch {
        settle('error', '음성 재생을 시작하지 못했습니다.');
      }
    });
  }

  private finish(generation: number, result: SpeechResult, message?: string): SpeechResult {
    if (generation !== this.generation) return 'cancelled';
    this.status = result === 'unsupported' ? 'unsupported' : result === 'error' ? 'error' : 'idle';
    this.error = message ?? null;
    this.currentText = '';
    this.emit();
    return result;
  }

  cancel(): void {
    this.generation += 1;
    try {
      this.synthesis?.cancel();
    } catch {
      // Some embedded browsers throw while their speech engine boots.
    }
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch {
        // The source may have failed before metadata was available.
      }
      this.activeAudio = null;
    }
    const settle = this.settleActive;
    this.settleActive = null;
    settle?.('cancelled');
    if (this.status !== 'idle' || this.currentText || this.error) {
      this.status = 'idle';
      this.currentText = '';
      this.error = null;
      this.emit();
    }
  }

  pause(): void {
    if (this.status !== 'speaking') return;
    try {
      if (this.activeAudio) this.activeAudio.pause();
      else this.synthesis?.pause();
      this.status = 'paused';
      this.emit();
    } catch {
      // Pause support varies; leaving playback active is safer than failing it.
    }
  }

  resume(): void {
    if (this.status !== 'paused') return;
    try {
      if (this.activeAudio) {
        const resumed = this.activeAudio.play();
        if (resumed && typeof resumed.catch === 'function') {
          resumed.catch(() => {
            this.status = 'error';
            this.error = '음성 재생을 다시 시작하지 못했습니다.';
            this.emit();
          });
        }
      } else this.synthesis?.resume();
      this.status = 'speaking';
      this.emit();
    } catch {
      this.status = 'error';
      this.error = '음성 재생을 다시 시작하지 못했습니다.';
      this.emit();
    }
  }

  destroy(): void {
    this.cancel();
    this.voiceRefreshTimers.forEach(clearTimeout);
    this.voiceRefreshTimers = [];
    this.synthesis?.removeEventListener?.('voiceschanged', this.handleVoicesChanged as EventListener);
    this.listeners.clear();
  }
}

let sharedService: SpeechService | undefined;

export function getSpeechService(): SpeechService {
  sharedService ??= new SpeechService();
  return sharedService;
}
