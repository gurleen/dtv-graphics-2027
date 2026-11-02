/**
 * The show page's column widths: a splitter between each pair of columns drags the left
 * column or the rail, and the rundown takes what is left. The widths are kept in this
 * browser's localStorage; a double-click on a splitter puts its column back.
 */

import { type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject, useState } from 'react';

const KEY = 'dtv.show.columns';
const MIN = { left: 240, rundown: 320, rail: 280 } as const;
const STEP = 16;

/** Pixel widths; null is the stylesheet's default. */
interface Columns {
  readonly left: number | null;
  readonly rail: number | null;
}

type Side = keyof Columns;

function stored(): Columns {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const width = (value: unknown) => (typeof value === 'number' && value > 0 ? value : null);
    return parsed && typeof parsed === 'object' ? { left: width((parsed as Columns).left), rail: width((parsed as Columns).rail) } : { left: null, rail: null };
  } catch {
    return { left: null, rail: null };
  }
}

/** The grid's rendered column widths: left, gap, rundown, gap, rail. */
const rendered = (page: HTMLElement) => getComputedStyle(page).gridTemplateColumns.split(' ').map(parseFloat);

export function useColumns(page: RefObject<HTMLElement | null>) {
  const [columns, setColumns] = useState(stored);

  const save = (next: Columns) => {
    setColumns(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  /** Widens `side` by `by` pixels, keeping every column at its minimum. */
  const resize = (side: Side, by: number, from = rendered(page.current!)) => {
    const [left = 0, , rundown = 0, , rail = 0] = from;
    const now = side === 'left' ? left : rail;
    const width = Math.round(Math.max(MIN[side], Math.min(now + by, now + rundown - MIN.rundown)));
    save({ ...columns, [side]: width });
  };

  const style = {
    ...(columns.left !== null && { '--left': `${columns.left}px` }),
    ...(columns.rail !== null && { '--rail': `${columns.rail}px` }),
  } as CSSProperties;

  const splitter = (side: Side) => ({
    side,
    width: columns[side],
    onDrag: (by: number, from: number[]) => resize(side, by, from),
    onStep: (by: number) => resize(side, by),
    onReset: () => save({ ...columns, [side]: null }),
    measure: () => rendered(page.current!),
  });

  return { style, left: splitter('left'), rail: splitter('rail') };
}

/** A vertical splitter in the gap beside `side`. Dragging right widens the left column and narrows the rail. */
export function Splitter(props: ReturnType<typeof useColumns>['left']) {
  const sign = props.side === 'left' ? 1 : -1;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    const startX = event.clientX;
    const from = props.measure();
    handle.setPointerCapture(event.pointerId);
    handle.dataset.dragging = '';
    const move = (moved: globalThis.PointerEvent) => props.onDrag(sign * (moved.clientX - startX), from);
    const up = () => {
      delete handle.dataset.dragging;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = event.key === 'ArrowLeft' ? -STEP : event.key === 'ArrowRight' ? STEP : 0;
    if (!by) return;
    event.preventDefault();
    props.onStep(sign * by);
  };

  return (
    <div
      className={`splitter splitter-${props.side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={props.side === 'left' ? 'Resize the left column' : 'Resize the monitors'}
      aria-valuenow={props.width ?? undefined}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={props.onReset}
    />
  );
}
