"use client";

import { useState, useEffect } from "react";
import AccountingApp from "./AccountingApp";

const SESSION_KEY = "accounting_authed";
const CORRECT_PASSWORD = "Admin";

export default function AccountingGate() {
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") setAuthed(true);
    setChecked(true);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === CORRECT_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
      setInput("");
    }
  };

  if (!checked) return null;

  if (authed) return <AccountingApp />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">会計</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Adminのみアクセスできます</p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-8 max-w-sm mx-auto">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
            🔒
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">パスワードを入力してください</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false); }}
            placeholder="パスワード"
            autoFocus
            className={`w-full border rounded-lg px-4 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${
              error ? "border-red-400 dark:border-red-500" : "border-gray-200 dark:border-gray-600"
            }`}
          />
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 text-center">パスワードが違います</p>
          )}
          <button type="submit"
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">
            ログイン
          </button>
        </form>
      </div>
    </div>
  );
}
