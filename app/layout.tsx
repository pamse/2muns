import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SplashScreen } from "@/components/SplashScreen";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "2müns — 66일 습관 형성 소셜 챌린지",
  description: "66일간 함께 인증하며 습관을 만드는 비공개 소셜 챌린지, 2müns",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#121316] text-white">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(sessionStorage.getItem("splash_seen"))document.documentElement.dataset.splash="seen"}catch(e){}})()`,
          }}
        />
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
