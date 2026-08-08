import { Clock3, Grid2X2, Shuffle } from "lucide-react";
import { memo } from "react";
import type { AppView } from "./types";

export interface MobileNavProps {
  value: AppView;
  onChange: (view: AppView) => void;
  reviewCount?: number;
}

const ITEMS: Array<{ value: AppView; label: string; Icon: typeof Grid2X2 }> = [
  { value: "grid", label: "그리드", Icon: Grid2X2 },
  { value: "random", label: "랜덤", Icon: Shuffle },
  { value: "review", label: "복습", Icon: Clock3 },
];

function MobileNavComponent({ value, onChange, reviewCount = 0 }: MobileNavProps) {
  return (
    <nav className="sg-mobile-nav" aria-label="주요 화면">
      {ITEMS.map(({ value: itemValue, label, Icon }) => {
        const active = value === itemValue;
        return (
          <button
            key={itemValue}
            type="button"
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(itemValue)}
          >
            <span>
              <Icon aria-hidden="true" />
              {itemValue === "review" && reviewCount > 0 ? <b>{reviewCount > 99 ? "99+" : reviewCount}</b> : null}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}

export const MobileNav = memo(MobileNavComponent);
