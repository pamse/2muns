// 2müns MVP — 타입 정의 & Mock 데이터
// 모든 화면이 공유하는 도메인 모델과 초기 목업 데이터를 한 곳에 모아둡니다.

export type TabKey = "info" | "find" | "my";
export type GroupStatus = "ongoing" | "joinable";
export type GroupFilter = GroupStatus | "mine";

/** 참여자(멤버) */
export type Member = {
  id: string;
  name: string;
  color: string; // 아바타 배경 그라디언트/컬러 (이니셜 폴백용)
  avatar: string; // 프로필 사진 URL
};

/** 습관 챌린지 모임 */
export type Group = {
  id: string;
  name: string;
  intro: string; // 한 줄 소개
  icon: string; // 레거시 이모지 (썸네일은 cover 사용)
  gradient: string; // 레거시 그라데이션
  cover: string; // 다크 무드 실사 썸네일 URL
  day: number; // 현재 진행 일수 (0 ~ 66)
  total: number; // 챌린지 총 일수 (66일 고정)
  capacity: number; // 최대 정원 (6명 고정)
  members: Member[]; // 현재 참여 멤버
  filter: GroupStatus; // 진행 중 / 참여 가능
  /** 개설자(방장) 유저 id */
  ownerId?: string;
  /** true면 24시간 자유 인증 */
  verifyAnytime?: boolean;
  /** 인증 가능 시작 시각 (0~24시) */
  verifyStartHour?: number;
  /** 인증 가능 종료 시각 (0~24시) */
  verifyEndHour?: number;
  /** 모임 카테고리 (예: 운동/헬스) */
  category?: string;
  /** recruiting: 대기 / started: 66일 레이스 진행 */
  raceStatus?: "recruiting" | "started";
};

/** 모임 상세(룸)의 숏폼 인증 영상 피드 아이템 */
export type FeedItem = {
  id: string;
  user: string;
  color: string; // 유저 아바타 컬러
  timeAgo: string;
  caption: string;
  thumb: string; // 비디오 목업 배경 그라디언트
  duration: string; // 영상 길이 (예: "0:15")
  likes: number;
  liked: boolean;
  videoUrl?: string; // 실시간 촬영본 Object URL
};

/** MY 탭 실시간 랭킹 항목 */
export type RankUser = {
  rank: number;
  name: string;
  color: string;
  points: number;
  avatarUrl: string;
  me?: boolean;
};

// ---- 아바타 컬러 팔레트 (네온 다크 테마와 어울리는 조합) ----
const C = {
  green: "linear-gradient(135deg,#00FF87,#0ea5e9)",
  purple: "linear-gradient(135deg,#a855f7,#6366f1)",
  pink: "linear-gradient(135deg,#f472b6,#fb7185)",
  amber: "linear-gradient(135deg,#f59e0b,#ef4444)",
  cyan: "linear-gradient(135deg,#22d3ee,#3b82f6)",
  lime: "linear-gradient(135deg,#a3e635,#22c55e)",
};

/** Unsplash 인물 크롭 — 스택 아바타용 */
const unsplash = (photoId: string) =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=128&h=128&q=80`;

/** Unsplash 정사각 커버 — 모임 썸네일용 */
const unsplashCover = (photoId: string) =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=400&q=80`;

export const ME_AVATAR = unsplash("1531746020798-e6953c6e8e04");

export const MEMBER_COLORS = [C.green, C.purple, C.pink, C.amber, C.cyan, C.lime];

export function memberColor(index: number) {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

/** 새 모임 개설 시 랜덤 배정할 다크 무드 커버 */
export const GROUP_COVERS = [
  unsplashCover("1507400492013-162706c8c05e"), // 새벽 하늘
  unsplashCover("1517836357463-d25dfeac3438"), // 덤벨/웨이트
  unsplashCover("1476275466078-4007374efbbe"), // 책과 커피
  unsplashCover("1461749280684-dccba630e2f6"), // 코드 모니터
  unsplashCover("1512820790803-83ca734da794"), // 펼친 책
  unsplashCover("1517694712202-14dd9538aa97"), // 데스크 셋업
];

const m = (id: string, name: string, color: string, avatar: string): Member => ({
  id,
  name,
  color,
  avatar,
});

export function isMyGroup(group: Group, myUserId?: string | null) {
  const ids = new Set<string>();
  if (myUserId) {
    ids.add(myUserId);
    ids.add("me");
  }
  if (group.ownerId && ids.has(group.ownerId)) {
    return true;
  }
  return group.members.some((member) => ids.has(member.id));
}

function normalizeMemberName(name: string) {
  return name.replace(/\(.*\)/, "").trim().toLowerCase();
}

export function isGroupMember(
  group: Group,
  me: { userId?: string | null; nickname?: string | null } = {},
) {
  if (isMyGroup(group, me.userId)) {
    return true;
  }
  const nickname = me.nickname?.trim();
  if (!nickname) {
    return false;
  }
  const needle = normalizeMemberName(nickname);
  return group.members.some((member) => normalizeMemberName(member.name) === needle);
}

export function getGroupOwnerId(group: Group) {
  return group.ownerId || group.members[0]?.id;
}

export function isGroupOwner(group: Group, userId?: string | null) {
  const ids = new Set<string>(["me"]);
  if (userId) {
    ids.add(userId);
  }
  const ownerId = getGroupOwnerId(group);
  return Boolean(ownerId && ids.has(ownerId));
}

export function hasRaceStarted(group: Group) {
  if (group.raceStatus === "started") {
    return true;
  }
  if (group.raceStatus === "recruiting") {
    return false;
  }
  return group.filter === "ongoing";
}

/** 로컬 데모 데이터. 메인 피드는 Supabase `groups`를 사용합니다. */
export const INITIAL_GROUPS: Group[] = [
  {
    id: "g1",
    name: "미라클 모닝 5AM",
    intro: "매일 새벽 5시 기상 인증으로 하루를 지배하기",
    icon: "🌅",
    gradient: "linear-gradient(135deg,#f59e0b,#ef4444)",
    cover: unsplashCover("1507400492013-162706c8c05e"),
    day: 18,
    total: 66,
    capacity: 6,
    members: [
      m("u1", "지민", C.green, unsplash("1534528741775-53994a69daeb")),
      m("u2", "현우", C.purple, unsplash("1539571696357-a21ce4dd3e30")),
      m("u3", "서연", C.pink, unsplash("1524504388940-b1c1722653e1")),
      m("u4", "도윤", C.cyan, unsplash("1500648767791-00dcc994a43e")),
      m("me", "나", C.green, ME_AVATAR),
    ],
    filter: "ongoing",
    raceStatus: "started",
    ownerId: "u1",
    verifyStartHour: 5,
    verifyEndHour: 9,
  },
  {
    id: "g2",
    name: "홈트 66일 챌린지",
    intro: "하루 15분 홈트레이닝, 몸이 바뀌는 두 달",
    icon: "💪",
    gradient: "linear-gradient(135deg,#00FF87,#0ea5e9)",
    cover: unsplashCover("1517836357463-d25dfeac3438"),
    day: 42,
    total: 66,
    capacity: 6,
    members: [
      m("u5", "민준", C.amber, unsplash("1506794778202-cad84cf45f1d")),
      m("u6", "하은", C.lime, unsplash("1438761681033-6461ffad8d80")),
      m("u7", "예준", C.purple, unsplash("1472099645785-5658abf4ff4e")),
      m("u8", "수아", C.pink, unsplash("1494790108377-be9c29b29330")),
      m("u9", "지호", C.cyan, unsplash("1519085360753-af0119f7cbe7")),
      m("me", "나", C.green, ME_AVATAR),
    ],
    filter: "ongoing",
    raceStatus: "started",
    ownerId: "u5",
  },
  {
    id: "g3",
    name: "하루 한 권 독서단",
    intro: "매일 30분 독서 후 짧은 리뷰 영상 남기기",
    icon: "📚",
    gradient: "linear-gradient(135deg,#a855f7,#6366f1)",
    cover: unsplashCover("1476275466078-4007374efbbe"),
    day: 0,
    total: 66,
    capacity: 6,
    members: [
      m("u10", "채원", C.green, unsplash("1544005313-94ddf0286df2")),
      m("u11", "시우", C.amber, unsplash("1463453091185-61582044d556")),
    ],
    filter: "joinable",
  },
  {
    id: "g4",
    name: "개발자 커리어 성장방",
    intro: "매일 커밋 & TIL 인증으로 성장하는 개발자 모임",
    icon: "👨‍💻",
    gradient: "linear-gradient(135deg,#22d3ee,#3b82f6)",
    cover: unsplashCover("1461749280684-dccba630e2f6"),
    day: 0,
    total: 66,
    capacity: 6,
    members: [m("u12", "나윤", C.pink, unsplash("1487412720507-e7ab37603c6f"))],
    filter: "joinable",
  },
];

export const INITIAL_FEED: FeedItem[] = [
  {
    id: "f1",
    user: "지민",
    color: C.green,
    timeAgo: "12분 전",
    caption: "오늘도 5시 기상 성공! 커피 내리는 중 ☕",
    thumb: "linear-gradient(160deg,#1f2937,#f59e0b33)",
    duration: "0:15",
    likes: 12,
    liked: false,
  },
  {
    id: "f2",
    user: "현우",
    color: C.purple,
    timeAgo: "1시간 전",
    caption: "새벽 러닝 3km 인증 🏃‍♂️ 다들 화이팅!",
    thumb: "linear-gradient(160deg,#111827,#a855f733)",
    duration: "0:15",
    likes: 8,
    liked: true,
  },
  {
    id: "f3",
    user: "서연",
    color: C.pink,
    timeAgo: "3시간 전",
    caption: "기상 후 스트레칭 루틴 공유합니다 🧘‍♀️",
    thumb: "linear-gradient(160deg,#0f172a,#f472b633)",
    duration: "0:14",
    likes: 21,
    liked: false,
  },
];

export const RANKING: RankUser[] = [
  { rank: 1, name: "하은", color: C.lime, points: 2480, avatarUrl: unsplash("1438761681033-6461ffad8d80") },
  { rank: 2, name: "민준", color: C.amber, points: 2310, avatarUrl: unsplash("1506794778202-cad84cf45f1d") },
  { rank: 3, name: "예준", color: C.purple, points: 2205, avatarUrl: unsplash("1472099645785-5658abf4ff4e") },
  { rank: 4, name: "나(You)", color: C.green, points: 1980, avatarUrl: ME_AVATAR, me: true },
  { rank: 5, name: "수아", color: C.pink, points: 1875, avatarUrl: unsplash("1494790108377-be9c29b29330") },
  { rank: 6, name: "지호", color: C.cyan, points: 1740, avatarUrl: unsplash("1519085360753-af0119f7cbe7") },
  { rank: 7, name: "채원", color: C.green, points: 1620, avatarUrl: unsplash("1544005313-94ddf0286df2") },
  { rank: 8, name: "시우", color: C.amber, points: 1510, avatarUrl: unsplash("1463453091185-61582044d556") },
  { rank: 9, name: "나윤", color: C.pink, points: 1390, avatarUrl: unsplash("1487412720507-e7ab37603c6f") },
  { rank: 10, name: "도윤", color: C.cyan, points: 1250, avatarUrl: unsplash("1500648767791-00dcc994a43e") },
];

/** 마이페이지에서 동시에 참여할 수 있는 최대 모임 수 */
export const MAX_JOINED_GROUPS = 3;

/** 습관 설문조사 카테고리 */
export const HABIT_CATEGORIES = [
  { id: "workout", label: "운동", icon: "💪" },
  { id: "morning", label: "미라클모닝", icon: "🌅" },
  { id: "reading", label: "독서", icon: "📚" },
  { id: "career", label: "커리어", icon: "🚀" },
  { id: "diet", label: "식단관리", icon: "🥗" },
  { id: "study", label: "공부", icon: "✏️" },
  { id: "meditation", label: "명상", icon: "🧘" },
  { id: "diary", label: "일기쓰기", icon: "📝" },
];

/** 목표 시간대 */
export const TIME_SLOTS = [
  { id: "dawn", label: "새벽 (04-07)", icon: "🌌" },
  { id: "morning", label: "아침 (07-11)", icon: "🌤️" },
  { id: "afternoon", label: "오후 (11-17)", icon: "☀️" },
  { id: "evening", label: "저녁 (17-21)", icon: "🌆" },
  { id: "night", label: "밤 (21-24)", icon: "🌙" },
];

/** 아바타에 표시할 이니셜(닉네임 첫 글자) 추출 */
export function initial(name: string): string {
  return name.replace(/\(.*\)/, "").trim().charAt(0);
}
