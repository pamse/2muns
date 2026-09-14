import { supabase } from "@/lib/supabase";

export type OAuthProvider = "kakao" | "google";

export function getOAuthRedirectUrl(nextPath = "/") {
  if (typeof window === "undefined") {
    return `/auth/callback?next=${encodeURIComponent(nextPath)}`;
  }
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signInWithOAuthProvider(provider: OAuthProvider) {
  const redirectTo = getOAuthRedirectUrl("/");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: false,
    },
  });
  if (error) {
    throw error;
  }
  return data;
}
