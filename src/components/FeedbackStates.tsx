import {
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  SearchX,
  X,
} from "lucide-react";
import { memo, type ReactNode } from "react";
import type { ToastItem } from "./types";

export interface ToastRegionProps {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}

const TOAST_ICON = {
  neutral: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
};

function ToastRegionComponent({ items, onDismiss }: ToastRegionProps) {
  return (
    <div className="sg-toast-region" aria-live="polite" aria-relevant="additions removals">
      {items.map((item) => {
        const tone = item.tone ?? "neutral";
        const Icon = TOAST_ICON[tone];
        return (
          <div key={item.id} className={`sg-toast is-${tone}`} role={tone === "error" ? "alert" : "status"}>
            <Icon aria-hidden="true" />
            <p>{item.message}</p>
            {item.actionLabel && item.onAction ? (
              <button type="button" className="sg-toast__action" onClick={item.onAction}>{item.actionLabel}</button>
            ) : null}
            <button type="button" className="sg-icon-button" aria-label="알림 닫기" onClick={() => onDismiss(item.id)}>
              <X aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export const ToastRegion = memo(ToastRegionComponent);

export interface LoadingGridProps {
  count?: number;
  label?: string;
}

export function LoadingGrid({ count = 18, label = "회화 패턴을 불러오는 중" }: LoadingGridProps) {
  return (
    <div className="sg-loading-grid" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="sg-loading-card" aria-hidden="true">
          <i /><i /><i /><span><i /><i /></span>
        </div>
      ))}
      <span className="sg-sr-only">{label}</span>
    </div>
  );
}

export interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function EmptyState({
  title = "조건에 맞는 표현이 없어요",
  description = "검색어를 줄이거나 필터를 하나씩 풀어 보세요.",
  actionLabel = "필터 초기화",
  onAction,
  icon,
}: EmptyStateProps) {
  return (
    <section className="sg-empty-state">
      <div className="sg-empty-state__icon" aria-hidden="true">{icon ?? <SearchX />}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {onAction ? <button type="button" className="sg-secondary-button" onClick={onAction}>{actionLabel}</button> : null}
    </section>
  );
}

export interface ErrorStateProps {
  title?: string;
  description: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "표현을 불러오지 못했어요",
  description,
  onRetry,
}: ErrorStateProps) {
  return (
    <section className="sg-empty-state is-error" role="alert">
      <div className="sg-empty-state__icon" aria-hidden="true"><AlertTriangle /></div>
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry ? (
        <button type="button" className="sg-secondary-button" onClick={onRetry}>
          <RefreshCw aria-hidden="true" /> 다시 시도
        </button>
      ) : null}
    </section>
  );
}
