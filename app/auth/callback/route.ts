import { NextResponse } from "next/server";
import {
  isUserRegistrationComplete,
  profileFromAuthUser,
} from "@/lib/authUser";
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

function redirectWithCookies(from: NextResponse, target: string | URL) {
  const to = NextResponse.redirect(target);
  from.cookies.getAll().forEach(({ name, value, ...options }) => {
    to.cookies.set(name, value, options);
  });
  return to;
}

function postAuthRedirectUrl(origin: string, next: string, registered: boolean) {
  if (registered) {
    return `${origin}${next}`;
  }
  const url = new URL("/", origin);
  url.searchParams.set("onboarding", "1");
  if (next !== "/") {
    url.searchParams.set("next", next);
  }
  return url.toString();
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

  const cookieResponse = NextResponse.redirect(`${origin}/`);
  const supabase = await createSupabaseRouteHandlerClient(cookieResponse);

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

  const { data: existingUser, error: profileError } = await supabase
    .from("users")
    .select("id, nickname, selected_categories")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("auth callback users select failed:", {
      message: profileError.message,
      code: profileError.code,
      userId: user.id,
    });
  }

  let userRow: {
    nickname: string | null;
    selected_categories: string[] | null;
  } | null = existingUser;

  if (!existingUser) {
    const profile = profileFromAuthUser(user);
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        id: profile.id,
        email: profile.email,
        nickname: profile.nickname,
        avatar_url: profile.avatar_url,
      })
      .select("nickname, selected_categories")
      .single();

    if (insertError) {
      console.error("auth callback users insert failed:", insertError);
    } else {
      userRow = newUser;
    }
  }

  const registered = isUserRegistrationComplete(userRow ?? null);
  const target = postAuthRedirectUrl(origin, next, registered);
  return redirectWithCookies(cookieResponse, target);
}
