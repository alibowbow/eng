import type { ConversationPattern } from '../content/schema';

export function makePattern(overrides: Partial<ConversationPattern> = {}): ConversationPattern {
  return {
    id: 'pattern.001',
    familyId: 'family.001',
    schemaVersion: 1,
    contentVersion: 1,
    pattern: "I'm about to + verb",
    english: "I'm about to leave.",
    korean: '이제 막 나가려던 참이야.',
    intentKo: '곧 하려는 일 말하기',
    nuanceKo: '아주 가까운 미래를 나타낸다.',
    usageNoteKo: '일상에서 자연스럽게 쓴다.',
    categoryIds: ['plans'],
    situationIds: ['daily'],
    tags: ['예정', '일상'],
    cefr: 'A2',
    priority: 'essential',
    register: ['casual', 'neutral'],
    examples: [
      { id: 'example.001', english: "I'm about to eat.", korean: '이제 막 먹으려던 참이야.' },
      { id: 'example.002', english: "I'm about to call her.", korean: '이제 막 그 사람에게 전화하려던 참이야.' },
      { id: 'example.003', english: "I'm about to start.", korean: '이제 막 시작하려던 참이야.' },
    ],
    variants: [
      { id: 'variant.001', english: "I'm just about to leave.", korean: '정말 이제 막 나가려던 참이야.', register: 'neutral' },
    ],
    replies: [
      { id: 'reply.001', english: 'Okay, see you soon.', korean: '알겠어, 곧 봐.', type: 'positive' },
    ],
    commonMistakes: [
      { wrong: 'I about to leave.', corrected: "I'm about to leave.", explanationKo: 'be 동사가 필요하다.' },
    ],
    relations: { similar: [], contrast: [], prerequisites: [], followUps: [], responses: [] },
    audio: { ttsText: "I'm about to leave.", lang: 'en-US' },
    sortKey: '001.001',
    releasedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}
