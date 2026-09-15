"use client";

import { use, useEffect, useState } from "react";
import { PublicProfileView } from "@/app/PublicProfileView";
import { readMyUserId } from "@/app/useNickname";

export default function ProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);

  useEffect(() => {
    setViewerUserId(readMyUserId());
  }, []);

  return (
    <PublicProfileView
      userId={decodeURIComponent(userId)}
      viewerUserId={viewerUserId}
      embedded={false}
    />
  );
}
