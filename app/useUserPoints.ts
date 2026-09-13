"use client";

import { useCallback, useEffect, useState } from "react";
import {
  POINTS_UPDATED_EVENT,
  fetchUserPointsSnapshot,
  type UserPointsSnapshot,
} from "@/lib/points";

const EMPTY: UserPointsSnapshot = {
  points: 0,
  extraGroupSlots: 0,
  heartBonusByGroup: {},
  awardedKeys: [],
  emojiFeedbackDate: "",
  emojiFeedbackCount: 0,
};

export function useUserPoints(userId: string | null | undefined) {
  const [snapshot, setSnapshot] = useState<UserPointsSnapshot>(EMPTY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSnapshot(EMPTY);
      return EMPTY;
    }
    setLoading(true);
    try {
      const next = await fetchUserPointsSnapshot(userId);
      setSnapshot(next);
      return next;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; snapshot: UserPointsSnapshot }>).detail;
      if (detail?.userId === userId) {
        setSnapshot(detail.snapshot);
      }
    };
    window.addEventListener(POINTS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(POINTS_UPDATED_EVENT, onUpdated);
  }, [userId]);

  const applySnapshot = useCallback((next: UserPointsSnapshot) => {
    setSnapshot(next);
  }, []);

  return {
    snapshot,
    points: snapshot.points,
    extraGroupSlots: snapshot.extraGroupSlots,
    heartBonusByGroup: snapshot.heartBonusByGroup,
    loading,
    refresh,
    applySnapshot,
  };
}
