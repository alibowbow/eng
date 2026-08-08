import { describe, expect, it, vi } from 'vitest';
import {
  ContinuousListenController,
  buildListenSteps,
  type ContinuousSpeaker,
} from './continuous-listener';
import type { SpeechResult } from './speech';

const item = {
  id: 'p1',
  english: 'Could you say that again?',
  korean: '다시 한 번 말씀해 주시겠어요?',
  ttsText: 'Could you say that again?',
  ttsLang: 'en-GB',
  audioUrl: '/normal.mp3',
  slowAudioUrl: '/slow.mp3',
};

describe('continuous listening', () => {
  it('builds each requested sequence with the correct language and gap', () => {
    expect(buildListenSteps(item, { mode: 'english-korean', gapMs: 2_000 }).map((step) => [step.lang, step.gapAfterMs])).toEqual([
      ['en-GB', 2_000],
      ['ko-KR', 0],
    ]);
    const slowNormal = buildListenSteps(item, { mode: 'slow-normal' });
    expect(slowNormal[0]).toMatchObject({ preferSlowAudio: true, slowAudioUrl: '/slow.mp3', settings: { rate: 0.72 } });
    expect(slowNormal[1]).toMatchObject({ text: item.english, audioUrl: '/normal.mp3' });
    expect(buildListenSteps(item, { mode: 'english', rate: 1.15 })[0].settings?.rate).toBe(1.15);
  });

  it('plays every item in order and exposes the currently highlighted id', async () => {
    const spoken: string[] = [];
    const speaker: ContinuousSpeaker = {
      speak: vi.fn(async (request) => { spoken.push(request.text); return 'ended' as const; }),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const controller = new ContinuousListenController(speaker, { mode: 'english', gapMs: 0 });
    const states: string[] = [];
    controller.subscribe((state) => states.push(`${state.status}:${state.currentId ?? '-'}`));
    controller.setItems([item, { ...item, id: 'p2', english: 'I am ready.', ttsText: 'I am ready.' }]);
    controller.play();

    for (let turn = 0; turn < 8 && controller.getState().status !== 'completed'; turn += 1) {
      await Promise.resolve();
    }

    expect(spoken).toEqual([item.english, 'I am ready.']);
    expect(states).toContain('playing:p1');
    expect(states).toContain('playing:p2');
    expect(controller.getState().status).toBe('completed');
    controller.destroy();
  });

  it('supports previous, next and stop through one cancellation authority', () => {
    const speaker: ContinuousSpeaker = {
      speak: vi.fn(() => new Promise<SpeechResult>(() => undefined)),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const controller = new ContinuousListenController(speaker, { gapMs: 0 });
    controller.setItems([item, { ...item, id: 'p2' }]);
    controller.play(0);
    controller.next();
    expect(controller.getState().index).toBe(1);
    controller.previous();
    expect(controller.getState().index).toBe(0);
    controller.stop();
    expect(controller.getState().status).toBe('stopped');
    expect(speaker.cancel).toHaveBeenCalled();
    controller.destroy();
  });
});
