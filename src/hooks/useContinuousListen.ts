import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ContinuousListenController,
  type ContinuousListenItem,
  type ContinuousListenOptions,
  type ContinuousListenState,
} from './continuous-listener';
import { getSpeechService, type SpeechService } from './speech';

export interface UseContinuousListenResult {
  state: ContinuousListenState;
  options: ContinuousListenOptions;
  play: (startIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  setItems: (items: readonly ContinuousListenItem[]) => void;
  setOptions: (options: Partial<ContinuousListenOptions>) => void;
}

export function useContinuousListen(
  items: readonly ContinuousListenItem[],
  initialOptions: Partial<ContinuousListenOptions> = {},
  speechService: SpeechService = getSpeechService(),
): UseContinuousListenResult {
  const controllerRef = useRef<ContinuousListenController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new ContinuousListenController(speechService, initialOptions);
  }
  const controller = controllerRef.current;
  const [state, setState] = useState<ContinuousListenState>(() => controller.getState());
  const [options, setOptionsState] = useState<ContinuousListenOptions>(() => controller.getOptions());

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    controller.setItems(items);
  }, [controller, items]);
  useEffect(() => () => controller.destroy(), [controller]);

  const play = useCallback((startIndex?: number) => controller.play(startIndex), [controller]);
  const pause = useCallback(() => controller.pause(), [controller]);
  const resume = useCallback(() => controller.resume(), [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  const next = useCallback(() => controller.next(), [controller]);
  const previous = useCallback(() => controller.previous(), [controller]);
  const setItems = useCallback((nextItems: readonly ContinuousListenItem[]) => controller.setItems(nextItems), [controller]);
  const setOptions = useCallback((nextOptions: Partial<ContinuousListenOptions>) => {
    controller.setOptions(nextOptions);
    setOptionsState(controller.getOptions());
  }, [controller]);

  return { state, options, play, pause, resume, stop, next, previous, setItems, setOptions };
}
