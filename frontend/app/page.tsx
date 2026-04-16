"use client";

import Link from "next/link";

const MENU_ITEMS = [
  {
    href: "/haisha",
    icon: "🚗",
    label: "配車",
    description: "最適な配車パターンを計算",
    color: "from-blue-500 to-blue-600",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-100 dark:border-blue-800",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
  },
  {
    href: "/accounting",
    icon: "💴",
    label: "会計",
    description: "収支を記録・管理",
    color: "from-emerald-500 to-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-100 dark:border-emerald-800",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">イベント管理</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">機能を選んでください</p>
      </div>

      {/* メニューグリッド */}
      <div className="grid grid-cols-2 gap-4">
        {MENU_ITEMS.map((item) => (
          <Link key={item.href} href={item.href}
            className={`${item.bg} ${item.border} border rounded-2xl p-5 flex flex-col gap-4 hover:shadow-md active:scale-[.97] transition-all`}>
            <div className={`w-14 h-14 ${item.iconBg} rounded-2xl flex items-center justify-center text-3xl`}>
              {item.icon}
            </div>
            <div>
              <p className="text-base font-bold text-gray-800 dark:text-gray-100">{item.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
