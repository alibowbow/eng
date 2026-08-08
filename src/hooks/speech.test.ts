import { describe, expect, it, vi } from 'vitest';
import {
  SpeechService,
  sanitizeTtsSettings,
  selectBestVoice,
  type PlayableAudio,
  type SpeechSynthesisLike,
} from './speech';

function voice(name: string, lang: string, options: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice {
  return {
    name,
    lang,
    voiceURI: `${lang}:${name}`,
    default: false,
    localService: true,
    ...options,
  };
}

class FakeSynthesis implements SpeechSynthesisLike {
  voices: SpeechSynthesisVoice[] = [];
  utterances: SpeechSynthesisUtterance[] = [];
  cancelCount = 0;
  listener?: EventListener;

  getVoices() { return this.voices; }
  speak(utterance: SpeechSynthesisUtterance) { this.utterances.push(utterance); }
  cancel() { this.cancelCount += 1; }
  pause() {}
  resume() {}
  addEventListener(_type: 'voiceschanged', listener: EventListener) { this.listener = listener; }
  removeEventListener() { this.listener = undefined; }
  emitVoicesChanged() { this.listener?.({} as Event); }
}

function utterance(text: string): SpeechSynthesisUtterance {
  return {
    text,
    lang: '',
    rate: 1,
    pitch: 1,
    volume: 1,
    voice: null,
    onend: null,
    onerror: null,
  } as unknown as SpeechSynthesisUtterance;
}

describe('speech helpers and service', () => {
  it('prefers a saved voice, an exact accent, then another English voice', () => {
    const voices = [voice('Korean', 'ko-KR'), voice('British', 'en-GB'), voice('American', 'en-US')];
    expect(selectBestVoice(voices, { lang: 'en-GB' })?.name).toBe('British');
    expect(selectBestVoice(voices, { voiceURI: voices[2].voiceURI, lang: 'en-GB' })?.name).toBe('American');
    expect(selectBestVoice(voices, { lang: 'en-AU' })?.lang.startsWith('en')).toBe(true);
    expect(selectBestVoice(voices, { voiceURI: voices[2].voiceURI, lang: 'ko-KR' })?.name).toBe('Korean');
  });

  it('sanitizes settings loaded from storage', () => {
    expect(sanitizeTtsSettings({ lang: '', rate: 99, pitch: -2, volume: Number.NaN })).toEqual({
      voiceURI: '',
      lang: 'en-US',
      rate: 2,
      pitch: 0,
      volume: 1,
    });
  });

  it('reacts when a browser loads voices after initialization', () => {
    const synthesis = new FakeSynthesis();
    const service = new SpeechService({ synthesis, createUtterance: utterance, createAudio: null, storage: null });
    const snapshots = vi.fn();
    service.subscribe(snapshots);

    synthesis.voices = [voice('American', 'en-US')];
    synthesis.emitVoicesChanged();

    expect(service.getSnapshot().voices).toHaveLength(1);
    expect(snapshots).toHaveBeenCalledTimes(2);
    service.destroy();
  });

  it('persists safe voice settings for the next service instance', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const synthesis = new FakeSynthesis();
    synthesis.voices = [voice('American', 'en-US')];
    const first = new SpeechService({ synthesis, createUtterance: utterance, createAudio: null, storage });
    first.updateSettings({ rate: 1.2, pitch: 0.9, voiceURI: synthesis.voices[0].voiceURI });
    first.destroy();
    const second = new SpeechService({ synthesis, createUtterance: utterance, createAudio: null, storage });
    expect(second.getSnapshot().settings).toMatchObject({ rate: 1.2, pitch: 0.9, voiceURI: synthesis.voices[0].voiceURI });
    second.destroy();
  });

  it('cancels the active queue before a new utterance starts', async () => {
    const synthesis = new FakeSynthesis();
    synthesis.voices = [voice('American', 'en-US')];
    const service = new SpeechService({ synthesis, createUtterance: utterance, createAudio: null, storage: null });

    const first = service.speak({ text: 'First' });
    const second = service.speak({ text: 'Second' });
    expect(await first).toBe('cancelled');
    expect(synthesis.cancelCount).toBeGreaterThanOrEqual(2);
    synthesis.utterances.at(-1)?.onend?.({} as SpeechSynthesisEvent);
    expect(await second).toBe('ended');
    expect(synthesis.utterances.at(-1)?.voice?.lang).toBe('en-US');
    service.destroy();
  });

  it('prefers a slow recorded URL and does not enqueue synthesis', async () => {
    const synthesis = new FakeSynthesis();
    let requestedUrl = '';
    const createAudio = (url: string): PlayableAudio => {
      requestedUrl = url;
      const listeners = new Map<string, EventListener>();
      return {
        currentTime: 0,
        playbackRate: 1,
        volume: 1,
        play: () => {
          queueMicrotask(() => listeners.get('ended')?.({} as Event));
          return Promise.resolve();
        },
        pause: () => undefined,
        addEventListener: (type, listener) => { listeners.set(type, listener); },
        removeEventListener: (type) => { listeners.delete(type); },
      };
    };
    const service = new SpeechService({ synthesis, createUtterance: utterance, createAudio, storage: null });

    await expect(service.speak({
      text: 'Recorded',
      audioUrl: '/normal.mp3',
      slowAudioUrl: '/slow.mp3',
      preferSlowAudio: true,
    })).resolves.toBe('ended');
    expect(requestedUrl).toBe('/slow.mp3');
    expect(synthesis.utterances).toHaveLength(0);
    service.destroy();
  });

  it('falls back to synthesis when a recorded file fails', async () => {
    const synthesis = new FakeSynthesis();
    synthesis.voices = [voice('American', 'en-US')];
    const createAudio = (): PlayableAudio => {
      const listeners = new Map<string, EventListener>();
      return {
        currentTime: 0,
        playbackRate: 1,
        volume: 1,
        play: () => {
          queueMicrotask(() => listeners.get('error')?.({} as Event));
          return Promise.resolve();
        },
        pause: () => undefined,
        addEventListener: (type, listener) => { listeners.set(type, listener); },
        removeEventListener: (type) => { listeners.delete(type); },
      };
    };
    const service = new SpeechService({ synthesis, createUtterance: utterance, createAudio, storage: null });
    const result = service.speak({ text: 'Fallback', audioUrl: '/missing.mp3' });
    for (let turn = 0; turn < 5 && synthesis.utterances.length === 0; turn += 1) await Promise.resolve();
    expect(synthesis.utterances).toHaveLength(1);
    synthesis.utterances[0].onend?.({} as SpeechSynthesisEvent);
    await expect(result).resolves.toBe('ended');
    service.destroy();
  });

  it('returns a clear unsupported result instead of throwing', async () => {
    const service = new SpeechService({ synthesis: null, createUtterance: null, createAudio: null, storage: null });
    await expect(service.speak({ text: 'Hello' })).resolves.toBe('unsupported');
    expect(service.getSnapshot().status).toBe('unsupported');
    expect(service.getSnapshot().error).toContain('사용할 수 없습니다');
  });
});
