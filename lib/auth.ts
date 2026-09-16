import { supabase } from "@/lib/supabase";

export type OAuthProvider = "kakao" | "google" | "apple";

export function getOAuthRedirectUrl(nextPath = "/") {
  if (typeof window === "undefined") {
    return `/auth/callback?next=${encodeURIComponent(nextPath)}`;
  }
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

/** Sign in with Apple (App Store 4.8) */
export async function signInWithApple(nextPath = "/") {
  const redirectTo = getOAuthRedirectUrl(nextPath);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo,
      scopes: "name email",
    },
  });
  if (error) {
    throw error;
  }
  return data;
}

export async function signInWithOAuthProvider(provider: Exclude<OAuthProvider, "apple">) {
  const redirectTo = getOAuthRedirectUrl("/");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: false,
      ...(provider === "kakao"
        ? { queryParams: { prompt: "select_account" } }
        : {}),
    },
  });
  if (error) {
    throw error;
  }
  return data;
}
