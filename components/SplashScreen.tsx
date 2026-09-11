"use client";

import { useEffect, useState } from "react";

const HOLD_MS = 1500;
const FADE_MS = 500;
const STORAGE_KEY = "splash_seen";

export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) {
        setVisible(false);
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Private mode 등에서 sessionStorage가 막혀도 이번 마운트에서는 스플래시를 보여 줍니다.
    }

    const fadeTimer = window.setTimeout(() => {
      setFading(true);
    }, HOLD_MS);

    const unmountTimer = window.setTimeout(() => {
      setVisible(false);
    }, HOLD_MS + FADE_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(unmountTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      data-splash-screen
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#0d1117] transition-opacity duration-500 ease-out ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      role="status"
      aria-label="2müns"
      aria-live="polite"
    >
      <div className="flex flex-col items-center px-6 text-center">
        <p className="splash-logo select-none text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
          2m<span className="text-[#00FF87]">ü</span>ns
        </p>
        <p className="splash-subtitle mt-3 text-sm font-medium tracking-[0.2em] text-white/70">
          66 Days Habit Race
        </p>
      </div>
    </div>
  );
}
