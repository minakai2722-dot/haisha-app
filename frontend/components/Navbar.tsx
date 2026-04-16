"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import GoogleLoginButton from "@/components/GoogleLoginButton";

const navItems = [
  { href: "/haisha",     label: "配車",       icon: "🚗" },
  { href: "/accounting", label: "会計",       icon: "💴" },
];

const PAGE_TITLES: Record<string, string> = {
  "/haisha":     "配車",
  "/accounting": "会計",
  "/calendar":   "カレンダー",
  "/warikan":    "割り勘",
};

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(false);

  const isHome = pathname === "/";
  const pageTitle = PAGE_TITLES[pathname] ?? "イベント管理";

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
      setDark(true);
    }
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <>
      {/* サイドバー（PC） */}
      <aside className="hidden md:flex flex-col w-56 min-h-screen bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 px-3 py-6 fixed top-0 left-0 transition-colors duration-200">
        <div className="mb-6 px-3">
          <Link href="/" className="block">
            <h1 className="text-base font-semibold text-gray-800 dark:text-gray-100">イベント管理</h1>
            <p className="text-xs text-gray-400 mt-0.5">チームツール</p>
          </Link>
        </div>
        <div className="px-3 mb-4">
          <GoogleLoginButton />
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                  active
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                }`}>
                <span className="text-base">{item.icon}</span>
                {item.label}
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />}
              </Link>
            );
          })}
        </nav>
        <button onClick={toggleDark}
          className="mx-3 mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <span>{dark ? "☀️" : "🌙"}</span>
          {dark ? "ライトモード" : "ダークモード"}
        </button>
      </aside>

      {/* トップバー（モバイル） */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 z-50 transition-colors duration-200" style={{ height: "52px" }}>
        <div className="flex items-center justify-between h-full">
          {/* 左側：戻るボタン or タイトル */}
          {isHome ? (
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">イベント管理</p>
          ) : (
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 text-sm font-medium -ml-1 px-1 py-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              戻る
            </button>
          )}

          {/* 右側：ダークモード + ログイン */}
          <div className="flex items-center gap-2">
            <button onClick={toggleDark} className="text-gray-400 dark:text-gray-500 p-1">
              <span>{dark ? "☀️" : "🌙"}</span>
            </button>
            <GoogleLoginButton />
          </div>
        </div>
      </header>

      {/* ボトムバー（モバイル） */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex z-50 transition-colors duration-200">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-all duration-150 ${
                active ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-600"
              }`}>
              <span className="text-xl">{item.icon}</span>
              {item.label}
              {active && <span className="w-1 h-1 rounded-full bg-blue-500" />}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
