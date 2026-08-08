import {
  MessageCircleReply,
  MessageSquareQuote,
  Replace,
  Turtle,
} from "lucide-react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

export type RadialDirection = "up" | "right" | "down" | "left";

export interface RadialGestureMenuProps {
  open: boolean;
  center: { x: number; y: number };
  activeDirection: RadialDirection | null;
  drag: { x: number; y: number };
}

const ACTIONS: ReadonlyArray<{
  direction: RadialDirection;
  label: string;
  Icon: typeof Replace;
}> = [
  { direction: "up", label: "대답", Icon: MessageCircleReply },
  { direction: "right", label: "바꿔 말하기", Icon: MessageSquareQuote },
  { direction: "down", label: "천천히", Icon: Turtle },
  { direction: "left", label: "단어 바꾸기", Icon: Replace },
];

export function RadialGestureMenu({
  open,
  center,
  activeDirection,
  drag,
}: RadialGestureMenuProps) {
  if (!open || typeof document === "undefined") return null;

  const menuSize = 188;
  const midpoint = menuSize / 2;
  const endpointX = midpoint + drag.x;
  const endpointY = midpoint + drag.y;

  return createPortal(
    <div
      className="sg-radial-scrim"
      aria-hidden="true"
      style={{
        "--sg-radial-x": `${center.x}px`,
        "--sg-radial-y": `${center.y}px`,
      } as CSSProperties}
    >
      <div
        className="sg-radial-menu"
        data-active-direction={activeDirection ?? "none"}
        style={{ left: center.x, top: center.y }}
      >
        {ACTIONS.map(({ direction, label, Icon }) => (
          <div
            key={direction}
            className={`sg-radial-menu__action is-${direction}${activeDirection === direction ? " is-active" : ""}`}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </div>
        ))}

        <svg
          className={`sg-radial-menu__trail${activeDirection ? " is-active" : ""}`}
          viewBox={`0 0 ${menuSize} ${menuSize}`}
          focusable="false"
        >
          <line x1={midpoint} y1={midpoint} x2={endpointX} y2={endpointY} />
        </svg>
        <span className="sg-radial-menu__origin" />
        <span
          className={`sg-radial-menu__thumb${activeDirection ? " is-active" : ""}`}
          style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}
        />
      </div>
    </div>,
    document.body,
  );
}
