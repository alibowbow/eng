export {
  DEFAULT_TTS_SETTINGS,
  SpeechService,
  TTS_SETTINGS_STORAGE_KEY,
  TTS_RATE_PRESETS,
  getSpeechService,
  sanitizeTtsSettings,
  selectBestVoice,
} from './speech';
export type {
  PlayableAudio,
  SpeechEnvironment,
  SpeechRequest,
  SpeechResult,
  SpeechSnapshot,
  SpeechStatus,
  SpeechSynthesisLike,
  TtsSettings,
  TtsRatePreset,
  VoicePreference,
} from './speech';
export { useSpeech, useSpeechSynthesis } from './useSpeech';
export type { UseSpeechResult } from './useSpeech';

export {
  ContinuousListenController,
  DEFAULT_CONTINUOUS_LISTEN_OPTIONS,
  buildListenSteps,
  sanitizeListenOptions,
} from './continuous-listener';
export type {
  ContinuousListenItem,
  ContinuousListenMode,
  ContinuousListenOptions,
  ContinuousListenState,
  ContinuousListenStatus,
  ContinuousSpeaker,
  ListenStep,
} from './continuous-listener';
export { useContinuousListen } from './useContinuousListen';
export type { UseContinuousListenResult } from './useContinuousListen';
