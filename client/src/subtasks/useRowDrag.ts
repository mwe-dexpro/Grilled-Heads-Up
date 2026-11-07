import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type RefObject } from "react";
import type { Subtask } from "./subtaskStore";
import { dropIndex } from "./subtasks";

/** A row being dragged by its handle: where it would land, how far the pointer moved, how tall it is. */
interface Drag {
  id: string;
  target: number;
  dy: number;
  height: number;
  pointerId: number;
  startY: number;
  /** Let go over another place: `dy` is then the way to that place, and the rows stay so until the move is saved and shown. */
  dropped?: boolean;
}

interface RowDragOptions {
  /** The Subtasks as shown, in order. */
  subtasks: Subtask[];
  /** The list element and the row elements, for where the places are in the page. */
  list: RefObject<HTMLUListElement | null>;
  rows: RefObject<Map<string, HTMLLIElement>>;
  /** Moves the Subtask to that index (a drop); the drag ends when what this returns settles. */
  onMove(id: string, toIndex: number): Promise<void> | void;
  /** The pointer moved a good way from where it went down: this is a drag, no tap. */
  onDragged(): void;
}

/** What a row shows of a drag in progress. */
export interface RowDragState {
  /** Some row is being dragged: the rows slide to make room. */
  reordering: boolean;
  /** This is the row being dragged. */
  dragged: boolean;
  style: CSSProperties | undefined;
}

/**
 * Dragging a Subtask's row by its handle, with a mouse or a finger: the row follows the pointer, the rows it passes make
 * room, and a drop over another place calls `onMove`. The rows stay where the drop put them until the move settles.
 */
export function useRowDrag({ subtasks, list, rows, onMove, onDragged }: RowDragOptions) {
  const [drag, setDrag] = useState<Drag | null>(null);
  // A drag moved the handle's pointer: the click that follows it (a mouse sends one; a finger does not) is no tap on the handle.
  const dragMoved = useRef(false);

  // A drag follows its Subtask, wherever a reload puts it. It ends when its Subtask is gone, and, once dropped, when the
  // move has settled (see `endDrag`).
  const dragFrom = drag ? subtasks.findIndex((s) => s.id === drag.id) : -1;
  const dragging = drag !== null && dragFrom !== -1 ? drag : null;

  useLayoutEffect(() => {
    if (drag && !dragging) setDrag(null);
  }, [drag, dragging]);

  function startDrag(e: PointerEvent<HTMLButtonElement>, subtask: Subtask, index: number) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const row = rows.current.get(subtask.id);
    if (!row) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragMoved.current = false;
    setDrag({ id: subtask.id, target: index, dy: 0, height: row.getBoundingClientRect().height, pointerId: e.pointerId, startY: e.clientY });
  }

  /** The vertical centre of each row's place, as it is in the page now (the layout, not where a transform has put the row). */
  function placeCentres(): number[] {
    const top = list.current ? list.current.getBoundingClientRect().top + list.current.clientTop : 0;
    return subtasks.map((s) => {
      const row = rows.current.get(s.id);
      return row ? top + row.offsetTop + row.offsetHeight / 2 : 0;
    });
  }

  function dragTo(e: PointerEvent<HTMLButtonElement>) {
    if (!dragging || e.pointerId !== dragging.pointerId || dragging.dropped) return;
    const dy = e.clientY - dragging.startY;
    if (Math.abs(dy) > 4) {
      dragMoved.current = true;
      onDragged();
    }
    setDrag({ ...dragging, dy, target: dropIndex(placeCentres(), dragFrom, e.clientY) });
  }

  /** How far the row at `from` has to go to sit in the place of the row at `target`, as the layout has it (rows can be of different heights). */
  function waySlot(from: number, target: number): number {
    const rowAt = (index: number) => {
      const subtask = subtasks[index];
      return subtask === undefined ? undefined : rows.current.get(subtask.id);
    };
    const here = rowAt(from);
    const there = rowAt(target);
    if (!here || !there) return 0;
    // Down: the bottom edges meet. Up: the top edges do.
    return target > from ? there.offsetTop + there.offsetHeight - (here.offsetTop + here.offsetHeight) : there.offsetTop - here.offsetTop;
  }

  /**
   * `drop`: the pointer went up (else the handle lost the pointer without a `pointerup`: the browser took it, or React
   * moved the row's node, and a cancelled pointer loses it too).
   */
  function endDrag(e: PointerEvent<HTMLButtonElement>, drop: boolean) {
    if (!dragging || e.pointerId !== dragging.pointerId || dragging.dropped) return;
    if (drop && dragging.target !== dragFrom) {
      const dropped = { ...dragging, dropped: true, dy: waySlot(dragFrom, dragging.target) };
      setDrag(dropped);
      // The drag ends when the move settles, whatever order was saved (another device may have moved or deleted
      // meanwhile) and also when it failed (the row then goes back). The move resolves after the reload has handed the
      // new order on (see `createListReader`), so React shows that order and the end of the drag in one render: no row
      // jumps. Only this drop's drag ends: the person may have grabbed another row while the move was being saved.
      void Promise.resolve(onMove(dragging.id, dragging.target)).finally(() => setDrag((current) => (current === dropped ? null : current)));
    } else {
      setDrag(null);
    }
  }

  /** Where a row sits while another is dragged: those the dragged row passes make room for it. */
  function shift(index: number): number {
    if (!dragging || index === dragFrom) return 0;
    if (index > dragFrom && index <= dragging.target) return -dragging.height;
    if (index < dragFrom && index >= dragging.target) return dragging.height;
    return 0;
  }

  return {
    /** The pointer handlers of a row's handle. */
    handleProps: (subtask: Subtask, index: number) => ({
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => startDrag(e, subtask, index),
      onPointerMove: dragTo,
      onPointerUp: (e: PointerEvent<HTMLButtonElement>) => endDrag(e, true),
      onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => endDrag(e, false),
    }),
    /** How a row looks now. The rows slide only while a drag is under way: when it ends they must not slide to where they are. */
    rowState(subtask: Subtask, index: number): RowDragState {
      const dragged = dragging?.id === subtask.id;
      return {
        reordering: dragging !== null,
        dragged,
        style: dragging
          ? {
              transform: `translateY(${dragged ? dragging.dy : shift(index)}px)`,
              transition: dragged && !dragging.dropped ? "none" : undefined,
            }
          : undefined,
      };
    },
    /**
     * Whether this click on a handle is the one that ends a mouse drag (and so is no tap). A click from the keyboard or
     * a screen reader (`detail` 0) never is: after a finger drag, which sends no click, the flag is still set, and
     * that click must still do what it says.
     */
    endsDrag(e: MouseEvent): boolean {
      if (!dragMoved.current || e.detail === 0) return false;
      dragMoved.current = false;
      return true;
    },
  };
}
