import {
  getSpeechService,
  type SpeechRequest,
  type SpeechResult,
  type SpeechService,
} from './speech';

export type ContinuousListenMode =
  | 'english'
  | 'english-korean'
  | 'korean-english'
  | 'english-twice'
  | 'slow-normal'
  | 'english-repeat';

export interface ContinuousListenItem {
  id: string;
  english: string;
  korean: string;
  ttsText?: string;
  ttsLang?: string;
  audioUrl?: string;
  slowAudioUrl?: string;
}

export interface ContinuousListenOptions {
  mode: ContinuousListenMode;
  /** Silence between separate cards. */
  gapMs: number;
  rate: number;
  repeat: boolean;
}

export interface ListenStep extends SpeechRequest {
  gapAfterMs: number;
}

export type ContinuousListenStatus = 'idle' | 'playing' | 'paused' | 'stopped' | 'completed' | 'error';

export interface ContinuousListenState {
  status: ContinuousListenStatus;
  index: number;
  currentId: string | null;
  total: number;
  error: string | null;
}

export interface ContinuousSpeaker {
  speak(request: SpeechRequest): Promise<SpeechResult>;
  cancel(): void;
  pause(): void;
  resume(): void;
}

export const DEFAULT_CONTINUOUS_LISTEN_OPTIONS: Readonly<ContinuousListenOptions> = Object.freeze({
  mode: 'english',
  gapMs: 1_000,
  rate: 1,
  repeat: false,
});

export function sanitizeListenOptions(
  options: Partial<ContinuousListenOptions> = {},
): ContinuousListenOptions {
  const modes: readonly ContinuousListenMode[] = [
    'english',
    'english-korean',
    'korean-english',
    'english-twice',
    'slow-normal',
    'english-repeat',
  ];
  return {
    mode: modes.includes(options.mode as ContinuousListenMode)
      ? options.mode as ContinuousListenMode
      : DEFAULT_CONTINUOUS_LISTEN_OPTIONS.mode,
    gapMs: Number.isFinite(options.gapMs)
      ? Math.max(0, Math.min(15_000, Math.round(options.gapMs!)))
      : DEFAULT_CONTINUOUS_LISTEN_OPTIONS.gapMs,
    rate: Number.isFinite(options.rate)
      ? Math.max(0.35, Math.min(2, options.rate!))
      : DEFAULT_CONTINUOUS_LISTEN_OPTIONS.rate,
    repeat: options.repeat ?? DEFAULT_CONTINUOUS_LISTEN_OPTIONS.repeat,
  };
}

function englishStep(item: ContinuousListenItem, overrides: Partial<ListenStep> = {}): ListenStep {
  return {
    text: item.ttsText || item.english,
    lang: item.ttsLang || 'en-US',
    audioUrl: item.audioUrl,
    slowAudioUrl: item.slowAudioUrl,
    gapAfterMs: 0,
    ...overrides,
  };
}

function koreanStep(item: ContinuousListenItem, gapAfterMs = 0): ListenStep {
  return { text: item.korean, lang: 'ko-KR', gapAfterMs };
}

/** Convert a mode into an explicit, easy-to-test playback sequence. */
export function buildListenSteps(
  item: ContinuousListenItem,
  optionsInput: Partial<ContinuousListenOptions> = {},
): ListenStep[] {
  const options = sanitizeListenOptions(optionsInput);
  const withRate = (steps: ListenStep[]) => steps.map((step) => ({
    ...step,
    settings: { rate: options.rate, ...step.settings },
  }));
  switch (options.mode) {
    case 'english-korean':
      return withRate([englishStep(item, { gapAfterMs: options.gapMs }), koreanStep(item)]);
    case 'korean-english':
      return withRate([koreanStep(item, options.gapMs), englishStep(item)]);
    case 'english-twice':
      return withRate([englishStep(item, { gapAfterMs: 180 }), englishStep(item)]);
    case 'slow-normal':
      return withRate([
        englishStep(item, {
          preferSlowAudio: true,
          settings: { rate: Math.max(0.35, options.rate * 0.72) },
          gapAfterMs: 240,
        }),
        englishStep(item),
      ]);
    case 'english-repeat':
      return withRate([englishStep(item, { gapAfterMs: options.gapMs }), englishStep(item)]);
    case 'english':
    default:
      return withRate([englishStep(item)]);
  }
}

export class ContinuousListenController {
  private items: ContinuousListenItem[] = [];
  private options: ContinuousListenOptions;
  private state: ContinuousListenState = {
    status: 'idle',
    index: 0,
    currentId: null,
    total: 0,
    error: null,
  };
  private readonly listeners = new Set<(state: ContinuousListenState) => void>();
  private runToken = 0;
  private resumeWaiters = new Set<() => void>();
  private readonly speaker: ContinuousSpeaker;

  constructor(
    speaker: ContinuousSpeaker = getSpeechService(),
    options: Partial<ContinuousListenOptions> = {},
  ) {
    this.speaker = speaker;
    this.options = sanitizeListenOptions(options);
  }

  getState(): ContinuousListenState {
    return this.state;
  }

  getOptions(): ContinuousListenOptions {
    return this.options;
  }

  subscribe(listener: (state: ContinuousListenState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<ContinuousListenState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  setItems(items: readonly ContinuousListenItem[]): void {
    const sameOrder = items.length === this.items.length && items.every((item, index) => item.id === this.items[index]?.id);
    this.items = [...items];
    if (sameOrder) {
      this.update({ total: items.length });
      return;
    }
    this.stop('idle');
    this.update({ index: 0, currentId: null, total: items.length, error: null });
  }

  setOptions(options: Partial<ContinuousListenOptions>): void {
    this.options = sanitizeListenOptions({ ...this.options, ...options });
  }

  play(startIndex = this.state.status === 'completed' ? 0 : this.state.index): void {
    if (!this.items.length) {
      this.update({ status: 'completed', index: 0, currentId: null, total: 0, error: null });
      return;
    }
    const index = Math.max(0, Math.min(this.items.length - 1, Math.floor(startIndex)));
    this.runToken += 1;
    this.speaker.cancel();
    this.wakeWaiters();
    this.update({ status: 'playing', index, currentId: this.items[index].id, total: this.items.length, error: null });
    void this.run(index, this.runToken);
  }

  private async run(startIndex: number, token: number): Promise<void> {
    for (let index = startIndex; index < this.items.length; index += 1) {
      if (!(await this.waitUntilPlaying(token))) return;
      const item = this.items[index];
      this.update({ index, currentId: item.id, status: 'playing' });

      for (const step of buildListenSteps(item, this.options)) {
        if (!(await this.waitUntilPlaying(token))) return;
        const result = await this.speaker.speak(step);
        if (token !== this.runToken) return;
        if (result === 'cancelled') return;
        if (result === 'error' || result === 'unsupported') {
          this.update({
            status: 'error',
            error: result === 'unsupported'
              ? '이 브라우저에서는 음성 재생을 사용할 수 없습니다.'
              : '연속 듣기 중 음성 재생에 실패했습니다.',
          });
          return;
        }
        if (step.gapAfterMs > 0 && !(await this.waitDelay(step.gapAfterMs, token))) return;
      }

      if (index < this.items.length - 1 && !(await this.waitDelay(this.options.gapMs, token))) return;
    }

    if (token === this.runToken && this.options.repeat && this.items.length) {
      void this.run(0, token);
    } else if (token === this.runToken) {
      this.update({ status: 'completed', currentId: null, index: this.items.length - 1 });
    }
  }

  private async waitUntilPlaying(token: number): Promise<boolean> {
    if (token !== this.runToken || ['idle', 'stopped', 'completed', 'error'].includes(this.state.status)) return false;
    if (this.state.status !== 'paused') return true;
    await new Promise<void>((resolve) => this.resumeWaiters.add(resolve));
    return token === this.runToken && this.isPlaying();
  }

  private isPlaying(): boolean {
    return this.state.status === 'playing';
  }

  private async waitDelay(durationMs: number, token: number): Promise<boolean> {
    let remaining = durationMs;
    let previous = Date.now();
    while (remaining > 0) {
      if (!(await this.waitUntilPlaying(token))) return false;
      const slice = Math.min(remaining, 80);
      await new Promise<void>((resolve) => setTimeout(resolve, slice));
      const current = Date.now();
      if (this.state.status === 'playing') remaining -= Math.max(0, current - previous);
      previous = current;
      if (token !== this.runToken) return false;
    }
    return true;
  }

  pause(): void {
    if (this.state.status !== 'playing') return;
    this.speaker.pause();
    this.update({ status: 'paused' });
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.speaker.resume();
    this.update({ status: 'playing' });
    this.wakeWaiters();
  }

  stop(status: 'idle' | 'stopped' = 'stopped'): void {
    this.runToken += 1;
    this.speaker.cancel();
    this.wakeWaiters();
    this.update({ status, currentId: null });
  }

  next(): void {
    if (!this.items.length) return;
    this.play(Math.min(this.items.length - 1, this.state.index + 1));
  }

  previous(): void {
    if (!this.items.length) return;
    this.play(Math.max(0, this.state.index - 1));
  }

  private wakeWaiters(): void {
    const waiters = [...this.resumeWaiters];
    this.resumeWaiters.clear();
    waiters.forEach((resolve) => resolve());
  }

  destroy(): void {
    this.stop('idle');
    this.listeners.clear();
  }
}

export type { SpeechService };
