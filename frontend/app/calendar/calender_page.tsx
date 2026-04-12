"use client";
import { useSession } from "next-auth/react";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type FormResult = {
  form_id?: string;
  form_url?: string;
  edit_url?: string;
  sheet_url?: string;
  error?: string;
};

type Member = {
  name: string;
  station: string;
  can_drive: boolean;
  capacity: number;
  want_with: string[];
  awkward_with: string[];
};

export default function CalendarPage() {
  const { data: session } = useSession();
  const [eventName, setEventName] = useState("イベント参加フォーム");
  const [formResult, setFormResult] = useState<FormResult | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingForm, setLoadingForm] = useState(false);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [applied, setApplied] = useState(false);

  const createForm = async () => {
    if (!session?.access_token) return;
    setLoadingForm(true);
    setFormResult(null);
    try {
      const res = await fetch(`${API_BASE}/create-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.access_token,
          event_name: eventName,
        }),
      });
      const data = await res.json();
      setFormResult(data);
    } catch {
      setFormResult({ error: "フォーム作成に失敗しました。" });
    } finally {
      setLoadingForm(false);
    }
  };

  const getResponses = async () => {
    if (!session?.access_token || !spreadsheetId) return;
    setLoadingSheet(true);
    setApplied(false);
    try {
      const res = await fetch(`${API_BASE}/get-responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.access_token,
          spreadsheet_id: spreadsheetId,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setMembers(data.members);
      }
    } catch {
      alert("回答の取得に失敗しました。");
    } finally {
      setLoadingSheet(false);
    }
  };

  const applyToHaisha = () => {
    localStorage.setItem("haisha_members", JSON.stringify(
      members.map((m) => ({
        id: crypto.randomUUID(),
        name: m.name,
        station: m.station,
        can_drive: m.can_drive,
        capacity: m.capacity,
        want_with: m.want_with.join(", "),
        awkward_with: m.awkward_with.join(", "),
      }))
    ));
    setApplied(true);
  };

  if (!session) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">フォーム自動作成</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Google Formを自動生成して参加者を募集します</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">この機能を使うにはGoogleでログインしてください</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">フォーム自動作成</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Google Formを自動生成して参加者を募集します</p>
      </div>

      {/* STEP 1: フォーム作成 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center justify-center">1</span>
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">フォームを作成する</h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">イベント名</label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="例：4月サークル合宿"
              className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
            />
          </div>

          <button
            onClick={createForm}
            disabled={loadingForm}
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-blue-300 text-white font-medium py-2.5 rounded-xl text-sm transition-all duration-150"
          >
            {loadingForm ? "作成中..." : "📋 Google Formを自動作成する"}
          </button>
        </div>

        {/* フォーム作成結果 */}
        {formResult && (
          <div className="mt-4 animate-slide-up">
            {formResult.error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">
                ⚠️ {formResult.error}
              </div>
            ) : (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">✅ フォームが作成されました！</p>
                <div className="space-y-2">
                  <a href={formResult.form_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    📋 参加者用URL（これを共有）
                  </a>
                  <a href={formResult.edit_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    ✏️ フォーム編集
                  </a>
                  <a href={formResult.sheet_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    📊 回答スプレッドシート
                  </a>
                </div>
                <div className="bg-white dark:bg-gray-700 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">スプレッドシートID（STEP2で使用）</p>
                  <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">{formResult.form_id}</p>
                  <button
                    onClick={() => { setSpreadsheetId(formResult.form_id || ""); }}
                    className="mt-2 text-xs px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"
                  >
                    STEP2に自動入力
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* STEP 2: 回答を取得 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center justify-center">2</span>
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">回答を取得する</h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">スプレッドシートID</label>
            <input
              type="text"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="スプレッドシートのURLから取得"
              className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
            />
            <p className="text-xs text-gray-400 mt-1">
              スプレッドシートURL: .../spreadsheets/d/<span className="text-blue-500">【ここがID】</span>/edit
            </p>
          </div>

          <button
            onClick={getResponses}
            disabled={loadingSheet || !spreadsheetId}
            className="w-full bg-green-600 hover:bg-green-700 active:scale-[0.98] disabled:bg-green-300 text-white font-medium py-2.5 rounded-xl text-sm transition-all duration-150"
          >
            {loadingSheet ? "取得中..." : "📥 回答を取得する"}
          </button>
        </div>

        {/* 回答プレビュー */}
        {members.length > 0 && (
          <div className="mt-4 animate-slide-up">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{members.length}件の回答を取得しました</p>
              {applied && <span className="text-xs text-green-600 dark:text-green-400">✅ 配車ページに反映済み</span>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700 mb-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    {["名前", "最寄り駅", "参加形態"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-medium">{m.name}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{m.station}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                          m.can_drive
                            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                            : "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                        }`}>
                          {m.can_drive ? "🚗 運転手" : "👤 乗客"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={applyToHaisha}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white transition-all duration-150"
            >
              🚗 配車ページに反映する
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
