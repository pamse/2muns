"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export const PULL_THRESHOLD = 64;
export const PULL_MAX = 96;
export const PULL_REST = 56;

function findScrollParent(el: HTMLElement) {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

function dampenPull(distance: number) {
  const x = Math.max(0, distance);
  return Math.min(PULL_MAX, (1 - Math.exp(-x / 78)) * PULL_MAX);
}

export function PullSpinner({
  spinning,
  progress,
}: {
  spinning: boolean;
  progress: number;
}) {
  const rotation = spinning ? undefined : Math.min(1, progress) * 270;
  return (
    <span
      className={`block h-[22px] w-[22px] rounded-full border-[2.5px] border-[#00E575]/20 border-t-[#00E575] ${
        spinning ? "animate-spin" : ""
      }`}
      style={spinning ? undefined : { transform: `rotate(${rotation}deg)` }}
      aria-hidden
    />
  );
}

export function usePullToRefresh({
  onRefresh,
  refreshing = false,
  enabled = true,
}: {
  onRefresh?: () => void | Promise<unknown>;
  refreshing?: boolean;
  enabled?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const pullingRef = useRef(false);
  const pullYRef = useRef(0);
  const refreshingRef = useRef(refreshing);
  const onRefreshRef = useRef(onRefresh);
  const [pullY, setPullY] = useState(0);
  const [settling, setSettling] = useState(false);

  refreshingRef.current = refreshing;
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    pullYRef.current = pullY;
  }, [pullY]);

  useEffect(() => {
    if (refreshing) return;
    if (pullYRef.current <= 0) return;
    setSettling(true);
    setPullY(0);
  }, [refreshing]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onRefresh || !enabled) return;
    const scroller = findScrollParent(root);
    if (!scroller) return;

    const prevOverscroll = scroller.style.overscrollBehaviorY;
    scroller.style.overscrollBehaviorY = "contain";

    const setPull = (value: number) => {
      pullYRef.current = value;
      setPullY(value);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (scroller.scrollTop > 0) {
        startYRef.current = null;
        pullingRef.current = false;
        return;
      }
      startYRef.current = event.touches[0].clientY;
      startXRef.current = event.touches[0].clientX;
      pullingRef.current = false;
      setSettling(false);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startYRef.current == null || refreshingRef.current) return;
      if (scroller.scrollTop > 0 && !pullingRef.current) {
        startYRef.current = null;
        setPull(0);
        return;
      }

      const touch = event.touches[0];
      const dy = touch.clientY - startYRef.current;
      const dx = touch.clientX - startXRef.current;

      if (!pullingRef.current) {
        if (dy < 8) return;
        if (Math.abs(dx) > dy) {
          startYRef.current = null;
          return;
        }
        pullingRef.current = true;
      }

      if (dy <= 0) {
        pullingRef.current = false;
        setPull(0);
        return;
      }

      event.preventDefault();
      setPull(dampenPull(dy));
    };

    const onTouchEnd = () => {
      if (startYRef.current == null) return;
      startYRef.current = null;
      pullingRef.current = false;
      if (pullYRef.current >= PULL_THRESHOLD) {
        setSettling(true);
        setPull(PULL_REST);
        void onRefreshRef.current?.();
        return;
      }
      setSettling(true);
      setPull(0);
    };

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd);
    scroller.addEventListener("touchcancel", onTouchEnd);

    return () => {
      scroller.style.overscrollBehaviorY = prevOverscroll;
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, onRefresh]);

  const pullHeight = refreshing ? Math.max(pullY, PULL_REST) : pullY;
  const pullProgress = pullHeight / PULL_THRESHOLD;
  const spinning = refreshing || pullHeight >= PULL_THRESHOLD;

  const onTransitionEnd = () => {
    if (!refreshing && pullHeight <= 0) setSettling(false);
  };

  return {
    rootRef,
    pullHeight,
    pullProgress,
    spinning,
    settling,
    onTransitionEnd,
  };
}

export function PullToRefresh({
  children,
  refreshing = false,
  onRefresh,
  enabled = true,
  className,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<unknown>;
  enabled?: boolean;
  className?: string;
}) {
  const { rootRef, pullHeight, pullProgress, spinning, settling, onTransitionEnd } =
    usePullToRefresh({ onRefresh, refreshing, enabled });

  return (
    <div ref={rootRef} className={className}>
      <div
        className={`flex items-center justify-center overflow-hidden ${
          settling || refreshing ? "transition-[height] duration-300 ease-out" : ""
        }`}
        style={{ height: pullHeight }}
        aria-hidden={pullHeight <= 0}
        aria-live="polite"
        onTransitionEnd={onTransitionEnd}
      >
        {pullHeight > 0 ? (
          <PullSpinner spinning={spinning} progress={pullProgress} />
        ) : null}
      </div>
      {children}
    </div>
  );
}
