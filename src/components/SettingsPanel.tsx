import {
  Accessibility,
  Download,
  Gauge,
  RotateCcw,
  Upload,
  Volume2,
} from "lucide-react";
import { memo, useRef } from "react";
import { OverlaySheet } from "./OverlaySheet";
import type { ListeningSettings, VoiceOption } from "./types";

export interface SettingsPanelProps {
  open: boolean;
  value: ListeningSettings;
  voices: VoiceOption[];
  onChange: (settings: ListeningSettings) => void;
  onClose: () => void;
  onExport?: () => void;
  onImport?: (file: File) => void;
  onReset?: () => void;
  onResetLearning?: () => void;
  onDeleteAll?: () => void;
}

function SettingsPanelComponent({
  open,
  value,
  voices,
  onChange,
  onClose,
  onExport,
  onImport,
  onReset,
  onResetLearning,
  onDeleteAll,
}: SettingsPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const update = <Key extends keyof ListeningSettings>(key: Key, next: ListeningSettings[Key]) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <OverlaySheet
      open={open}
      title="설정"
      description="음성과 화면 설정은 이 기기에 저장됩니다."
      onClose={onClose}
      position="right"
      size="compact"
      className="sg-settings-sheet"
    >
      <section className="sg-settings-section">
        <div className="sg-settings-section__title"><Volume2 aria-hidden="true" /><h3>영어 음성</h3></div>
        <label className="sg-form-field">
          <span>목소리</span>
          <select value={value.voiceId} onChange={(event) => update("voiceId", event.target.value)}>
            <option value="">기기 기본 영어 음성</option>
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}{voice.lang ? ` · ${voice.lang}` : ""}
              </option>
            ))}
          </select>
          {voices.length === 0 ? <small>사용 가능한 영어 음성을 불러오는 중입니다.</small> : null}
        </label>
        <RangeField label="속도" value={value.rate} min={0.5} max={1.5} step={0.05} onChange={(next) => update("rate", next)} />
        <RangeField label="음높이" value={value.pitch} min={0.5} max={1.5} step={0.05} onChange={(next) => update("pitch", next)} />
        <RangeField label="음량" value={value.volume} min={0} max={1} step={0.05} onChange={(next) => update("volume", next)} />
      </section>

      <section className="sg-settings-section">
        <div className="sg-settings-section__title"><Accessibility aria-hidden="true" /><h3>화면과 조작</h3></div>
        <SwitchField
          label="읽는 카드 자동 따라가기"
          description="직접 스크롤하면 자동 이동을 잠시 멈춥니다."
          checked={value.autoScroll}
          onChange={(next) => update("autoScroll", next)}
        />
        <SwitchField
          label="고대비 모드"
          description="텍스트와 경계선을 더 선명하게 표시합니다."
          checked={value.highContrast}
          onChange={(next) => update("highContrast", next)}
        />
        <SwitchField
          label="움직임 줄이기"
          description="강조와 화면 전환 움직임을 최소화합니다."
          checked={value.reduceMotion}
          onChange={(next) => update("reduceMotion", next)}
        />
      </section>

      <section className="sg-settings-section">
        <div className="sg-settings-section__title"><Download aria-hidden="true" /><h3>내 학습 기록</h3></div>
        <p className="sg-settings-note">진도, 즐겨찾기와 메모를 파일로 옮길 수 있습니다.</p>
        <div className="sg-settings-actions">
          <button type="button" className="sg-secondary-button" onClick={onExport} disabled={!onExport}>
            <Download aria-hidden="true" /> 백업
          </button>
          <button type="button" className="sg-secondary-button" onClick={() => fileRef.current?.click()} disabled={!onImport}>
            <Upload aria-hidden="true" /> 복원
          </button>
          <input
            ref={fileRef}
            className="sg-visually-hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport?.(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </section>

      {onReset ? (
        <button type="button" className="sg-text-button sg-reset-settings" onClick={onReset}>
          <RotateCcw aria-hidden="true" /> 기본 설정으로 되돌리기
        </button>
      ) : null}

      {onResetLearning || onDeleteAll ? (
        <section className="sg-settings-section sg-danger-zone">
          <div className="sg-settings-section__title"><Accessibility aria-hidden="true" /><h3>데이터 초기화</h3></div>
          <p className="sg-settings-note">확인 후 실행되며, 백업하지 않은 기록은 되돌릴 수 없습니다.</p>
          <div className="sg-settings-actions">
            {onResetLearning ? (
              <button type="button" className="sg-danger-button" onClick={onResetLearning}>
                학습 진도 초기화
              </button>
            ) : null}
            {onDeleteAll ? (
              <button type="button" className="sg-danger-button is-strong" onClick={onDeleteAll}>
                모든 로컬 데이터 삭제
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </OverlaySheet>
  );
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function RangeField({ label, value, min, max, step, onChange }: RangeFieldProps) {
  return (
    <label className="sg-range-field">
      <span><Gauge aria-hidden="true" />{label}<output>{value.toFixed(2)}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} />
    </label>
  );
}

interface SwitchFieldProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SwitchField({ label, description, checked, onChange }: SwitchFieldProps) {
  return (
    <label className="sg-switch-field">
      <span><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export const SettingsPanel = memo(SettingsPanelComponent);
