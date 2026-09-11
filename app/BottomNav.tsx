// 2müns — 하단 고정 탭 네비게이션 바
"use client";

import { BookOpen, Compass, User } from "lucide-react";
import type { TabKey } from "./data";

const TABS: { key: TabKey; label: string; Icon: typeof Compass }[] = [
  { key: "info", label: "인사이트", Icon: BookOpen },
  { key: "find", label: "모임찾기", Icon: Compass },
  { key: "my", label: "MY", Icon: User },
];

export function BottomNav({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
}) {
  return (
    <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-gray-800 bg-[#1B1D22]/95 backdrop-blur-md">
      <ul className="flex items-stretch justify-around px-2 pb-2 pt-2.5">
        {TABS.map(({ key, label, Icon }) => {
          const isActive = active === key;
          return (
            <li key={key} className="flex-1">
              <button
                onClick={() => onChange(key)}
                className="flex w-full flex-col items-center gap-1 py-1"
                aria-current={isActive ? "page" : undefined}
              >
                <Icon
                  size={22}
                  className={isActive ? "text-[#00FF87]" : "text-gray-500"}
                  strokeWidth={isActive ? 2.4 : 2}
                />
                <span
                  className={`text-[11px] font-medium ${
                    isActive ? "text-[#00FF87]" : "text-gray-500"
                  }`}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
