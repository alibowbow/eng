import { useCallback, useEffect, useState } from 'react';
import {
  getSpeechService,
  type SpeechRequest,
  type SpeechService,
  type SpeechSnapshot,
  type TtsSettings,
} from './speech';

export interface UseSpeechResult extends SpeechSnapshot {
  speak: (request: SpeechRequest | string) => ReturnType<SpeechService['speak']>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  setSettings: (settings: Partial<TtsSettings>) => TtsSettings;
}

export function useSpeech(service: SpeechService = getSpeechService()): UseSpeechResult {
  const [snapshot, setSnapshot] = useState<SpeechSnapshot>(() => service.getSnapshot());

  useEffect(() => {
    setSnapshot(service.getSnapshot());
    return service.subscribe(setSnapshot);
  }, [service]);

  const speak = useCallback(
    (request: SpeechRequest | string) => service.speak(typeof request === 'string' ? { text: request } : request),
    [service],
  );
  const stop = useCallback(() => service.cancel(), [service]);
  const pause = useCallback(() => service.pause(), [service]);
  const resume = useCallback(() => service.resume(), [service]);
  const setSettings = useCallback((settings: Partial<TtsSettings>) => service.updateSettings(settings), [service]);

  return { ...snapshot, speak, stop, pause, resume, setSettings };
}

export const useSpeechSynthesis = useSpeech;
