"use client";

import { Crown } from "lucide-react";
import type { Group, Member } from "./data";
import { getGroupOwnerId, normalizeGroupId } from "./data";
import { Avatar, BottomSheet } from "./ui";
import { cacheBustAvatarUrl, pickMemberAvatarUrl } from "@/lib/profile";
import { filterMembersList } from "@/lib/moderation";
import { MemberMoreButton } from "./UserModerationUi";

export function GroupMembersSheet({
  open,
  onClose,
  group,
  viewerUserId,
  blockedUserIds,
  onMemberAction,
}: {
  open: boolean;
  onClose: () => void;
  group: Group;
  viewerUserId?: string | null;
  blockedUserIds: ReadonlySet<string>;
  onMemberAction: (member: Member) => void;
}) {
  const ownerId = getGroupOwnerId(group);
  const viewerNorm = normalizeGroupId(viewerUserId);
  const members = filterMembersList(group.members, blockedUserIds);

  return (
    <BottomSheet open={open} onClose={onClose} title={`멤버 (${members.length}/${group.capacity})`}>
      <ul className="max-h-[50vh] space-y-1 overflow-y-auto pb-2">
        {members.map((member) => {
          const isSelf = Boolean(viewerNorm && normalizeGroupId(member.id) === viewerNorm);
          const isOwner = Boolean(ownerId && member.id === ownerId);
          const avatarRaw = pickMemberAvatarUrl(member);
          const avatarSrc = avatarRaw
            ? cacheBustAvatarUrl(avatarRaw, `${member.id}:${avatarRaw}`)
            : undefined;

          return (
            <li
              key={member.id}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.03]"
            >
              <span className="relative shrink-0">
                <Avatar name={member.name} color={member.color} src={avatarSrc} size={40} />
                {isOwner ? (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-black">
                    <Crown size={10} strokeWidth={2.5} />
                  </span>
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {member.name}
                  {isSelf ? (
                    <span className="ml-1 text-[11px] font-medium text-[#00FF87]">나</span>
                  ) : null}
                </p>
                {isOwner ? (
                  <p className="text-[11px] text-amber-400/90">방장</p>
                ) : null}
              </div>
              {!isSelf ? (
                <MemberMoreButton
                  label={`${member.name} 더보기`}
                  onClick={() => onMemberAction(member)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {members.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">표시할 멤버가 없습니다.</p>
      ) : null}
    </BottomSheet>
  );
}
