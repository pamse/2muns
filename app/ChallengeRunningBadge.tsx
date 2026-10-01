"use client";

import { Flame } from "lucide-react";
import { isCompletedGroup, type Group } from "./data";
import { Pill } from "./ui";

export function challengeDaysLeft(group: Pick<Group, "day" | "total">) {
  return Math.max(0, group.total - group.day);
}

export function isChallengeFinalDay(group: Pick<Group, "day" | "total">) {
  return group.day >= group.total || challengeDaysLeft(group) === 0;
}

export function resolveChallengeRunningBadge(input: {
  group: Group;
  /** 오늘(현재 챌린지 일차) 본인 인증 완료 여부 */
  myTodayVerified: boolean;
}) {
  const { group, myTodayVerified } = input;

  if (isCompletedGroup(group)) {
    return { kind: "success" as const, text: "🎉 완주 성공" };
  }

  const daysLeft = challengeDaysLeft(group);
  const finalDay = isChallengeFinalDay(group);

  if (finalDay && myTodayVerified) {
    return { kind: "success" as const, text: "🎉 완주 성공" };
  }

  if (finalDay) {
    return { kind: "final_sprint" as const, text: "🔥 D-0 달리는 중" };
  }

  return { kind: "running" as const, text: `🔥 D-${daysLeft} 달리는 중` };
}

export function ChallengeRunningBadge({
  group,
  myTodayVerified = false,
  className = "",
}: {
  group: Group;
  myTodayVerified?: boolean;
  className?: string;
}) {
  const badge = resolveChallengeRunningBadge({ group, myTodayVerified });

  if (badge.kind === "success") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 ${className}`}
      >
        {badge.text}
      </span>
    );
  }

  return (
    <Pill tone="warn" className={className}>
      <Flame size={12} />
      {badge.text.replace(/^🔥\s*/, "")}
    </Pill>
  );
}
