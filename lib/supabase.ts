import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase 환경 변수 누락:", {
    hasUrl: Boolean(supabaseUrl),
    hasKey: Boolean(supabaseAnonKey),
  });
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY 환경 변수가 없습니다.",
  );
}

export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
