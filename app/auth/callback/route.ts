import { NextResponse } from "next/server";
import { profileFromAuthUser } from "@/lib/authUser";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

function safeNextPath(raw: string | null) {
  const next = raw ?? "/";
  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
}

function authFailedRedirect(origin: string, reason: string) {
  const url = new URL("/", origin);
  url.searchParams.set("error", "auth-failed");
  url.searchParams.set("reason", reason);
  return NextResponse.redirect(url.toString());
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");
  if (oauthError) {
    console.error("auth callback provider error:", {
      oauthError,
      oauthErrorDescription,
      query: searchParams.toString(),
    });
    return authFailedRedirect(origin, oauthError);
  }

  if (!code) {
    console.error("auth callback missing code:", searchParams.toString());
    return authFailedRedirect(origin, "missing-code");
  }

  const successRedirect = NextResponse.redirect(`${origin}${next}`);
  const supabase = await createSupabaseRouteHandlerClient(successRedirect);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("exchangeCodeForSession failed:", {
      message: error.message,
      status: error.status,
      name: error.name,
      code: error.code,
    });
    return authFailedRedirect(origin, "exchange-failed");
  }

  const user = data.session?.user;
  if (!user) {
    console.error("exchangeCodeForSession succeeded but user is missing");
    return authFailedRedirect(origin, "missing-user");
  }

  const profile = profileFromAuthUser(user);
  const { error: upsertError } = await supabase.from("users").upsert(
    {
      id: profile.id,
      email: profile.email,
      nickname: profile.nickname,
      avatar_url: profile.avatar_url,
    },
    { onConflict: "id" },
  );

  if (upsertError) {
    console.error("auth callback users upsert failed:", {
      message: upsertError.message,
      code: upsertError.code,
      details: upsertError.details,
      hint: upsertError.hint,
      userId: user.id,
      profile,
    });
    // 세션은 유효 — 온보딩 단계에서 프로필 재저장 가능
  }

  return successRedirect;
}
