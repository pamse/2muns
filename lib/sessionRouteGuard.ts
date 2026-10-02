/** 로그아웃·탈퇴 직후 bfcache 복원 시 세션 재검증용 */
export const SESSION_CLEARED_FLAG = "muns_session_cleared";

export function markSessionRouteCleared() {
  try {
    sessionStorage.setItem(SESSION_CLEARED_FLAG, "1");
  } catch {
    // sessionStorage unavailable
  }
}

export function consumeSessionRouteCleared(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_CLEARED_FLAG) === "1") {
      sessionStorage.removeItem(SESSION_CLEARED_FLAG);
      return true;
    }
  } catch {
    // sessionStorage unavailable
  }
  return false;
}

/** SPA 히스토리 엔트리를 루트로 정리 (뒤로 가기 시 만료 세션 화면 방지) */
export function replaceAppRootPath() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname || "/";
  window.history.replaceState({ munsApp: true }, "", path.split("?")[0] || "/");
}
