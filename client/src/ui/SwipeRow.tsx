import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { actionWidth, canStartSwipe, dragOffset, settle } from "./swipe";

export interface SwipeAction {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Picks the colours (see `.swipe-action` in styles.css). */
  tone: "neutral" | "primary" | "strong";
  onSelect(): void;
}

interface SwipeRowProps {
  actions: SwipeAction[];
  /** Long press (`contextmenu`, which Android Chrome fires on long press and desktop on right click). */
  onMenu(): void;
  /** Classes of the row's content, which slides over the actions. */
  className?: string;
  children: ReactNode;
}

/** A pointer that moved less than this many pixels is a tap, not a swipe. */
const slop = 8;

/**
 * A list row that slides left to reveal its actions. Any pointer type works (touch, pen, mouse); the row only
 * claims horizontal moves (`touch-action: pan-y`), so the page still scrolls. The rules are in `swipe.ts`. While
 * the row is closed its actions are hidden from screen readers and can't be focused; the accessible way to the
 * same actions is Task detail, or the long press.
 */
export function SwipeRow({ actions, onMenu, className, children }: SwipeRowProps) {
  const row = useRef<HTMLLIElement>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const rest = useRef(0);
  const live = useRef(0);
  const gesture = useRef<{ x: number; y: number; from: number; moved: boolean; active: boolean } | null>(null);
  const swallowClick = useRef(false);
  const actionsWidth = actions.length * actionWidth;
  const open = offset !== 0;

  function follow(next: number) {
    live.current = next;
    setOffset(next);
  }

  function show(next: number) {
    rest.current = next;
    follow(next);
  }

  // An open row closes when the pointer lands anywhere else, and when the page scrolls.
  useEffect(() => {
    if (!open || dragging) return;
    const close = () => show(0);
    const closeOutside = (event: globalThis.PointerEvent) => {
      if (!row.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, dragging]);

  function handleDown(event: PointerEvent<HTMLDivElement>) {
    swallowClick.current = false;
    if (actions.length === 0 || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!canStartSwipe(event.clientX, window.innerWidth)) return;
    gesture.current = { x: event.clientX, y: event.clientY, from: rest.current, moved: false, active: false };
  }

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (Math.hypot(dx, dy) > slop) g.moved = true;
    if (!g.active) {
      // The row follows only once the finger has clearly gone sideways and the row would move.
      if (Math.abs(dx) <= slop || dragOffset(dx, dy, actionsWidth, g.from) === g.from) return;
      g.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    follow(dragOffset(dx, 0, actionsWidth, g.from));
  }

  function handleUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    swallowClick.current = g.moved;
    if (g.active) {
      setDragging(false);
      show(settle(live.current, actionsWidth));
    }
  }

  function handleCancel() {
    const g = gesture.current;
    gesture.current = null;
    if (g?.active) {
      setDragging(false);
      follow(rest.current);
    }
  }

  /** The click that ends a swipe does nothing; a tap on an open row closes it instead of opening the Task. */
  function handleClickCapture(event: MouseEvent) {
    if (swallowClick.current) {
      swallowClick.current = false;
    } else if (rest.current === 0) {
      return;
    } else {
      show(0);
    }
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <li
      ref={row}
      className="swipe-row"
      onContextMenu={(event) => {
        event.preventDefault();
        show(0);
        onMenu();
      }}
    >
      <div className="swipe-actions" aria-hidden={open ? undefined : true} inert={!open}>
        {actions.map(({ id, label, icon: Icon, tone, onSelect }) => (
          <button
            key={id}
            type="button"
            className={`swipe-action ${tone}`}
            onClick={() => {
              show(0);
              onSelect();
            }}
          >
            <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div
        className={["swipe-content", className, dragging && "dragging"].filter(Boolean).join(" ")}
        style={{ transform: offset === 0 ? undefined : `translateX(${offset}px)` }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleCancel}
        onClickCapture={handleClickCapture}
        onDragStart={(event) => event.preventDefault()}
      >
        {children}
      </div>
    </li>
  );
}
