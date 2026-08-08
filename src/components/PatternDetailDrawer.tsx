import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  MessageCircleReply,
  PencilLine,
  Sparkles,
  Volume2,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import type { ConversationPattern } from "../content/schema";
import { OverlaySheet } from "./OverlaySheet";
import type { PatternProgressView } from "./types";

export interface PatternDetailDrawerProps {
  open: boolean;
  pattern: ConversationPattern | null;
  progress?: PatternProgressView;
  relatedPatterns?: ConversationPattern[];
  note?: string;
  onClose: () => void;
  onSpeak: (pattern: ConversationPattern) => void;
  onSaveNote?: (patternId: string, note: string) => void;
  onSelectRelated?: (patternId: string) => void;
}

const REGISTER_LABELS: Record<string, string> = {
  casual: "캐주얼",
  neutral: "중립",
  polite: "공손",
  formal: "격식",
};

function PatternDetailDrawerComponent({
  open,
  pattern,
  progress,
  relatedPatterns = [],
  note = "",
  onClose,
  onSpeak,
  onSaveNote,
  onSelectRelated,
}: PatternDetailDrawerProps) {
  const [draftNote, setDraftNote] = useState(note);

  useEffect(() => setDraftNote(note), [note, pattern?.id]);

  if (!pattern) return null;

  const visibleRelated = relatedPatterns.filter((item) => item.id !== pattern.id).slice(0, 5);

  return (
    <OverlaySheet
      open={open}
      title="표현 자세히 보기"
      description="그리드 위치는 그대로 유지됩니다."
      onClose={onClose}
      position="right"
      size="regular"
      className="sg-detail-sheet"
    >
      <div className="sg-detail-hero">
        <div className="sg-detail-hero__meta">
          <span>{pattern.cefr}</span>
          {pattern.register.map((register) => (
            <span key={register}>{REGISTER_LABELS[register] ?? register}</span>
          ))}
        </div>
        <p className="sg-detail-formula" lang="en">{pattern.pattern}</p>
        <h3 lang="en">{pattern.english}</h3>
        <p className="sg-detail-korean" lang="ko">{pattern.korean}</p>
        <div className="sg-detail-hero__actions">
          <button type="button" className="sg-primary-button" onClick={() => onSpeak(pattern)}>
            <Volume2 aria-hidden="true" /> 발음 듣기
          </button>
        </div>
      </div>

      <section className="sg-detail-section">
        <div className="sg-detail-section__title">
          <Sparkles aria-hidden="true" />
          <h3>느낌과 쓰임</h3>
        </div>
        <dl className="sg-detail-facts">
          <div><dt>말하는 의도</dt><dd>{pattern.intentKo}</dd></div>
          {pattern.nuanceKo ? <div><dt>핵심 뉘앙스</dt><dd>{pattern.nuanceKo}</dd></div> : null}
          {pattern.usageNoteKo ? <div><dt>언제 쓰나요</dt><dd>{pattern.usageNoteKo}</dd></div> : null}
        </dl>
        <div className="sg-detail-tags" aria-label="상황과 태그">
          {[...pattern.tags, ...pattern.situationIds].map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </section>

      {pattern.examples.length > 0 ? (
        <section className="sg-detail-section">
          <div className="sg-detail-section__title">
            <MessageCircleReply aria-hidden="true" />
            <h3>다른 상황에서 말하기</h3>
          </div>
          <ol className="sg-example-list">
            {pattern.examples.map((example) => (
              <li key={example.id}>
                <p lang="en">{example.english}</p>
                <span lang="ko">{example.korean}</span>
                {example.noteKo ? <small>{example.noteKo}</small> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {pattern.variants.length > 0 ? (
        <section className="sg-detail-section">
          <div className="sg-detail-section__title">
            <ArrowRight aria-hidden="true" />
            <h3>말투 바꾸기</h3>
          </div>
          <div className="sg-variant-list">
            {pattern.variants.map((variant) => (
              <article key={variant.id}>
                <small>{REGISTER_LABELS[variant.register] ?? variant.register}</small>
                <p lang="en">{variant.english}</p>
                <span lang="ko">{variant.korean}</span>
                {variant.nuanceKo ? <em>{variant.nuanceKo}</em> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {pattern.replies.length > 0 ? (
        <section className="sg-detail-section">
          <div className="sg-detail-section__title">
            <CheckCircle2 aria-hidden="true" />
            <h3>이어지는 대답</h3>
          </div>
          <div className="sg-reply-list">
            {pattern.replies.map((reply) => (
              <div key={reply.id}>
                <small>{reply.type}</small>
                <p lang="en">{reply.english}</p>
                <span lang="ko">{reply.korean}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {pattern.commonMistakes.length > 0 ? (
        <section className="sg-detail-section sg-mistake-section">
          <div className="sg-detail-section__title">
            <CircleAlert aria-hidden="true" />
            <h3>자주 하는 실수</h3>
          </div>
          {pattern.commonMistakes.map((mistake) => (
            <div className="sg-mistake" key={`${mistake.wrong}-${mistake.corrected}`}>
              <p className="is-wrong" lang="en"><span>×</span>{mistake.wrong}</p>
              <p className="is-correct" lang="en"><span>✓</span>{mistake.corrected}</p>
              <small>{mistake.explanationKo}</small>
            </div>
          ))}
        </section>
      ) : null}

      {visibleRelated.length > 0 ? (
        <section className="sg-detail-section">
          <div className="sg-detail-section__title"><ArrowRight aria-hidden="true" /><h3>관련 패턴</h3></div>
          <div className="sg-related-list">
            {visibleRelated.map((related) => (
              <button key={related.id} type="button" onClick={() => onSelectRelated?.(related.id)}>
                <span lang="en">{related.english}</span>
                <ChevronLabel />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="sg-detail-section">
        <div className="sg-detail-section__title"><PencilLine aria-hidden="true" /><h3>내 메모</h3></div>
        <textarea
          className="sg-note-field"
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
          placeholder="헷갈리는 점이나 나만의 예문을 적어 두세요."
          rows={4}
        />
        {onSaveNote ? (
          <button type="button" className="sg-secondary-button sg-note-save" onClick={() => onSaveNote(pattern.id, draftNote)}>
            메모 저장
          </button>
        ) : null}
      </section>
    </OverlaySheet>
  );
}

function ChevronLabel() {
  return <ArrowRight aria-hidden="true" />;
}

export const PatternDetailDrawer = memo(PatternDetailDrawerComponent);
