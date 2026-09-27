import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Attribute every drop target (table row / card) carries so the pointer can be hit-tested back to a visible index. */
export const REORDER_INDEX_ATTR = 'data-reorder-index';

const AUTO_SCROLL_EDGE_PX = 64;
const AUTO_SCROLL_MAX_STEP_PX = 14;

function findVerticalScrollParent(element: Element | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current && current !== document.body) {
    const { overflowY } = window.getComputedStyle(current);
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function indexAtPoint(x: number, y: number): number | null {
  if (typeof document.elementFromPoint !== 'function') return null;
  const target = document.elementFromPoint(x, y)?.closest(`[${REORDER_INDEX_ATTR}]`);
  if (!target) return null;
  const parsed = Number(target.getAttribute(REORDER_INDEX_ATTR));
  return Number.isInteger(parsed) ? parsed : null;
}

export interface PointerReorderState {
  fromIndex: number;
  overIndex: number;
}

/**
 * Drag-to-reorder driven by Pointer Events rather than HTML5 drag-and-drop,
 * so the same handle works with a mouse, a finger (iPhone / iPad Safari never
 * fire HTML5 drag events for touch) and an Apple Pencil. The handle needs
 * `touch-action: none` so the browser doesn't claim the gesture as a scroll;
 * while dragging, the page auto-scrolls when the pointer nears the top or
 * bottom edge so long runsheets can still be reordered end-to-end.
 */
export function usePointerReorder(onReorder: (fromIndex: number, toIndex: number) => void, disabled = false) {
  const [drag, setDrag] = useState<PointerReorderState | null>(null);
  const dragRef = useRef<PointerReorderState | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const updateOver = useCallback((x: number, y: number) => {
    const current = dragRef.current;
    if (!current) return;
    const overIndex = indexAtPoint(x, y);
    if (overIndex === null || overIndex === current.overIndex) return;
    dragRef.current = { ...current, overIndex };
    setDrag(dragRef.current);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const autoScrollTick = useCallback(() => {
    frameRef.current = null;
    const pointer = pointerRef.current;
    if (!dragRef.current || !pointer) return;

    const scrollParent = scrollParentRef.current;
    const bounds = scrollParent
      ? scrollParent.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };

    let step = 0;
    if (pointer.y < bounds.top + AUTO_SCROLL_EDGE_PX) {
      step = -Math.ceil(((bounds.top + AUTO_SCROLL_EDGE_PX - pointer.y) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_STEP_PX);
    } else if (pointer.y > bounds.bottom - AUTO_SCROLL_EDGE_PX) {
      step = Math.ceil(((pointer.y - (bounds.bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_STEP_PX);
    }

    if (step !== 0) {
      if (scrollParent) scrollParent.scrollBy(0, step);
      else window.scrollBy(0, step);
      // Content moved under a stationary finger — re-resolve the hovered row.
      updateOver(pointer.x, pointer.y);
    }
    frameRef.current = window.requestAnimationFrame(autoScrollTick);
  }, [updateOver]);

  const endDrag = useCallback(
    (commit: boolean) => {
      const current = dragRef.current;
      dragRef.current = null;
      pointerRef.current = null;
      scrollParentRef.current = null;
      stopAutoScroll();
      setDrag(null);
      if (commit && current && current.fromIndex !== current.overIndex) {
        onReorderRef.current(current.fromIndex, current.overIndex);
      }
    },
    [stopAutoScroll]
  );

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const getHandleProps = (index: number) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = { fromIndex: index, overIndex: index };
      pointerRef.current = { x: event.clientX, y: event.clientY };
      scrollParentRef.current = findVerticalScrollParent(event.currentTarget);
      setDrag(dragRef.current);
      if (typeof window.requestAnimationFrame === 'function') {
        frameRef.current = window.requestAnimationFrame(autoScrollTick);
      }
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current) return;
      event.preventDefault();
      pointerRef.current = { x: event.clientX, y: event.clientY };
      updateOver(event.clientX, event.clientY);
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      endDrag(true);
    },
    onPointerCancel: () => endDrag(false),
    onClick: (event: React.MouseEvent<HTMLElement>) => event.stopPropagation(),
    style: { touchAction: 'none' } as React.CSSProperties,
  });

  return { drag, getHandleProps };
}
