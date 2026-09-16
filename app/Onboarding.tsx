// 2müns — 회원가입 온보딩 & 개인정보 보호 흐름 (스텝 뷰)
"use client";

import { useEffect, useState } from "react";
import { isNicknameTaken } from "@/lib/nicknameCheck";
import { Check, Loader2, Lock, ShieldCheck, Sparkles, X } from "lucide-react";
import {
  signInWithApple,
  signInWithOAuthProvider,
  type OAuthProvider,
} from "@/lib/auth";
import { HABIT_CATEGORIES, TIME_SLOTS } from "./data";
import { validateNickname } from "./useNickname";
import { supabase } from "@/lib/supabase";

type Step = 0 | 1 | 2 | 3 | 4; // 0:소셜 1:닉네임 2:습관 3:시간대 4:개인정보
type SocialProvider = OAuthProvider;

/** 카카오 로그인 집중 테스트 기간 — Google 버튼 일시 비활성 */
const SHOW_GOOGLE_LOGIN = false;

const NICKNAME_CHECK_DEBOUNCE_MS = 400;

function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#191919"
        d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.86 5.31 4.62 6.72-.19.7-.69 2.54-.79 2.95-.12.5.18.49.38.36.16-.11 2.54-1.73 3.56-2.43A13.4 13.4 0 0 0 12 19c5.52 0 10-3.58 10-8s-4.48-8-10-8Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
      />
    </svg>
  );
}

export function Onboarding({
  open,
  required = false,
  currentUserId = null,
  onClose,
  onComplete,
}: {
  open: boolean;
  required?: boolean;
  currentUserId?: string | null;
  onClose: () => void;
  onComplete: (payload: {
    nickname: string;
    selectedCategories: string[];
  }) => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>(0);
  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [nickname, setNickname] = useState("");
  const [habits, setHabits] = useState<string[]>([]);
  const [slot, setSlot] = useState<string>("");
  const [socialError, setSocialError] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(currentUserId);
  const [nicknameTaken, setNicknameTaken] = useState(false);
  const [nicknameChecking, setNicknameChecking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingProvider(null);
    setSaving(false);
    setSaveError(null);
    setSocialError(null);
    setNickname("");
    setHabits([]);
    setSlot("");
    setNicknameTaken(false);
    setNicknameChecking(false);

    void supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUserId(session?.user?.id ?? currentUserId ?? null);
      setStep(session ? 1 : 0);
    });
  }, [open, currentUserId]);

  useEffect(() => {
    if (currentUserId) setAuthUserId(currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    if (!open || step !== 1) return;

    const trimmed = nickname.trim();
    const formatError = validateNickname(nickname);
    if (!trimmed || formatError) {
      setNicknameTaken(false);
      setNicknameChecking(false);
      return;
    }

    setNicknameChecking(true);
    setNicknameTaken(false);
    const timer = window.setTimeout(() => {
      void isNicknameTaken(trimmed, authUserId).then((taken) => {
        setNicknameTaken(taken);
        setNicknameChecking(false);
      });
    }, NICKNAME_CHECK_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [nickname, step, open, authUserId]);

  if (!open) return null;

  const nicknameError = nickname.trim() ? validateNickname(nickname) : null;

  function toggleHabit(id: string) {
    setHabits((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  }

  async function startSocial(provider: SocialProvider) {
    if (loadingProvider) return;
    setLoadingProvider(provider);
    setSocialError(null);
    try {
      if (provider === "apple") {
        await signInWithApple("/");
      } else {
        await signInWithOAuthProvider(provider);
      }
    } catch (error) {
      console.error("oauth sign-in failed", error);
      const label =
        provider === "apple"
          ? "Apple 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요."
          : "소셜 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
      setSocialError(label);
      setLoadingProvider(null);
    }
  }

  const nicknameFormatValid = validateNickname(nickname) === null;
  const nicknameStepReady =
    nicknameFormatValid && !nicknameTaken && !nicknameChecking;

  const canNext =
    (step === 1 && nicknameStepReady) ||
    (step === 2 && habits.length > 0) ||
    (step === 3 && slot !== "") ||
    step === 4;

  async function next() {
    if (step === 1) {
      const trimmed = nickname.trim();
      if (validateNickname(trimmed) !== null) return;
      setNicknameChecking(true);
      const taken = await isNicknameTaken(trimmed, authUserId);
      setNicknameChecking(false);
      if (taken) {
        setNicknameTaken(true);
        return;
      }
      setNicknameTaken(false);
      setStep(2);
      return;
    }

    if (step < 4) {
      setStep((s) => (s + 1) as Step);
      return;
    }
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onComplete({
        nickname: nickname.trim(),
        selectedCategories: habits,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "닉네임을 저장하지 못했습니다.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  const totalSteps = 5;
  const busy = loadingProvider !== null || saving;
  const canGoBack = !(required && step === 0);

  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-[#121316]">
      {/* 헤더 + 진행 인디케이터 */}
      <header className="px-4 pt-4">
        <div className="flex items-center justify-between">
          {canGoBack ? (
            <button
              type="button"
              onClick={() => (step === 0 ? onClose() : setStep((s) => (s - 1) as Step))}
              className="text-sm text-gray-400"
            >
              {step === 0 ? <X size={22} /> : "이전"}
            </button>
          ) : (
            <span className="inline-block w-[22px]" />
          )}
          <span className="text-xs text-gray-500">
            {step + 1} / {totalSteps}
          </span>
        </div>
        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${
                i <= step ? "bg-[#00FF87]" : "bg-gray-700"
              }`}
            />
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-8">
        {/* STEP 0 — 카카오 / 구글 소셜 로그인 */}
        {step === 0 && (
          <div className="flex flex-1 flex-col">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-[#1B1D22]">
              <Sparkles size={24} className="text-[#00FF87]" />
            </div>
            <h1 className="text-2xl font-extrabold text-white">간편하게 시작하기</h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              3초 만에 로그인하고 66일 습관 여정을 시작하세요.
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">
              *모임 내 참여자 정보는 비공개로 안전하게 보호됩니다.
            </p>

            <div className="flex flex-1 flex-col items-center justify-center">
              {socialError ? (
                <p className="mb-4 w-full max-w-xs rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {socialError}
                </p>
              ) : null}

              <div className="w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => void startSocial("kakao")}
                  disabled={busy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-sm font-bold text-[#191919] transition-transform active:scale-[0.98] disabled:opacity-70"
                >
                  {loadingProvider === "kakao" ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <KakaoIcon />
                  )}
                  카카오로 3초 만에 시작하기
                </button>
                <button
                  type="button"
                  onClick={() => void startSocial("apple")}
                  disabled={busy}
                  className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-black text-sm font-semibold text-white ring-1 ring-white/10 transition-transform active:scale-[0.98] disabled:opacity-70"
                >
                  {loadingProvider === "apple" ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <AppleIcon />
                  )}
                  Apple로 계속하기
                </button>
                {SHOW_GOOGLE_LOGIN ? (
                  <button
                    type="button"
                    onClick={() => void startSocial("google")}
                    disabled={busy}
                    className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-700 bg-[#1F222A] text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-70"
                  >
                    {loadingProvider === "google" ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <GoogleIcon />
                    )}
                    Google 계정으로 계속하기
                  </button>
                ) : null}
              </div>
            </div>

            <p className="mt-auto pt-10 pb-6 text-center text-xs leading-relaxed text-gray-500">
              시작 시 이용약관 및 개인정보처리방침에 동의하게 됩니다.
            </p>
          </div>
        )}

        {/* STEP 1 — 닉네임 설정 */}
        {step === 1 && (
          <div>
            <h1 className="text-2xl font-extrabold text-white">
              닉네임을 <br /> 정해주세요
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              다른 멤버에게 보여질 이름이에요. 2~10자로 입력해 주세요.
            </p>
            <label className="mt-6 block">
              <span className="sr-only">닉네임</span>
              <input
                type="text"
                value={nickname}
                maxLength={10}
                autoComplete="off"
                autoFocus
                placeholder="예: 습관러_01"
                onChange={(event) => setNickname(event.target.value)}
                aria-invalid={Boolean(nicknameError || nicknameTaken)}
                className={`w-full rounded-2xl border bg-[#1B1D22] px-4 py-3.5 text-sm text-white outline-none placeholder:text-gray-600 ${
                  nicknameError || nicknameTaken
                    ? "border-red-500 focus:border-red-400"
                    : "border-gray-700 focus:border-[#00FF87]"
                }`}
              />
            </label>
            <p className="mt-2 text-[12px] text-gray-500">
              한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.
            </p>
            {nicknameError ? (
              <p className="mt-1.5 text-[12px] text-red-400">{nicknameError}</p>
            ) : null}
            {!nicknameError && nicknameTaken ? (
              <p className="mt-1.5 text-[12px] text-red-400">
                동일한 닉네임이 이미 존재합니다
              </p>
            ) : null}
            {!nicknameError && nicknameChecking && nickname.trim() ? (
              <p className="mt-1.5 text-[12px] text-gray-500">닉네임 확인 중...</p>
            ) : null}
            <p className="mt-5 rounded-xl border border-[#00FF87]/20 bg-[#00FF87]/10 px-3.5 py-3 text-[12px] leading-relaxed text-gray-300">
              닉네임은 14일 동안 최대 2회만 변경할 수 있습니다.
            </p>
          </div>
        )}

        {/* STEP 2 — 습관 카테고리 설문 */}
        {step === 2 && (
          <div>
            <h1 className="text-2xl font-extrabold text-white">
              어떤 습관을 <br /> 만들고 싶나요?
            </h1>
            <p className="mt-2 text-sm text-gray-400">복수 선택이 가능해요.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {HABIT_CATEGORIES.map((c) => {
                const on = habits.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleHabit(c.id)}
                    className={`flex items-center gap-2.5 rounded-2xl border p-4 text-left transition-colors ${
                      on
                        ? "border-[#00FF87] bg-[#00FF87]/10"
                        : "border-gray-800 bg-[#1B1D22]"
                    }`}
                  >
                    <span className="text-2xl">{c.icon}</span>
                    <span
                      className={`text-sm font-semibold ${
                        on ? "text-[#00FF87]" : "text-white"
                      }`}
                    >
                      {c.label}
                    </span>
                    {on && <Check size={16} className="ml-auto text-[#00FF87]" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3 — 목표 시간대 설문 */}
        {step === 3 && (
          <div>
            <h1 className="text-2xl font-extrabold text-white">
              주로 언제 <br /> 실천하실 건가요?
            </h1>
            <p className="mt-2 text-sm text-gray-400">가장 집중하기 좋은 시간대를 골라주세요.</p>
            <div className="mt-6 space-y-3">
              {TIME_SLOTS.map((t) => {
                const on = slot === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSlot(t.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                      on
                        ? "border-[#00FF87] bg-[#00FF87]/10"
                        : "border-gray-800 bg-[#1B1D22]"
                    }`}
                  >
                    <span className="text-2xl">{t.icon}</span>
                    <span
                      className={`flex-1 text-sm font-semibold ${
                        on ? "text-[#00FF87]" : "text-white"
                      }`}
                    >
                      {t.label}
                    </span>
                    {on && <Check size={18} className="text-[#00FF87]" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 4 — 개인정보 & 보안 안내 */}
        {step === 4 && (
          <div>
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00FF87]/15">
              <ShieldCheck size={24} className="text-[#00FF87]" />
            </div>
            <h1 className="text-2xl font-extrabold text-white">
              당신의 기록은 <br /> 안전하게 보호돼요
            </h1>

            <div className="mt-6 space-y-3">
              {[
                {
                  Icon: Lock,
                  title: "완전 비공개 방",
                  body: "업로드한 인증 영상과 참여자 정보는 같은 방의 6인에게만 공개됩니다. 외부 검색·공유가 불가능해요.",
                },
                {
                  Icon: ShieldCheck,
                  title: "계정 정보 비공개",
                  body: "로그인에 사용한 카카오·구글 계정 정보는 암호화되며 다른 멤버에게 절대 노출되지 않습니다.",
                },
                {
                  Icon: X,
                  title: "66일 후 자동 삭제",
                  body: "챌린지가 종료되면 방과 영상은 자동 폭파되어 흔적이 남지 않아요.",
                },
              ].map(({ Icon, title, body }) => (
                <div
                  key={title}
                  className="flex gap-3 rounded-2xl border border-gray-800 bg-[#1B1D22] p-4"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#00FF87]/10">
                    <Icon size={18} className="text-[#00FF87]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{title}</h3>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-gray-400">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            {saveError && (
              <p className="mt-4 text-[12px] text-red-400">{saveError}</p>
            )}
          </div>
        )}
      </div>

      {/* 하단 CTA — 소셜 로그인 단계에서는 버튼이 본문에 있으므로 숨김 */}
      {step !== 0 && (
        <div className="border-t border-gray-800 p-4">
          <button
            type="button"
            onClick={() => void next()}
            disabled={!canNext || saving}
            className={`w-full rounded-xl py-3.5 text-sm font-bold transition-colors ${
              canNext && !saving
                ? "bg-[#00FF87] text-black active:scale-[0.98]"
                : "cursor-not-allowed bg-gray-700 text-gray-500"
            }`}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                저장 중
              </span>
            ) : step === 4 ? (
              "동의하고 시작하기"
            ) : (
              "다음"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
