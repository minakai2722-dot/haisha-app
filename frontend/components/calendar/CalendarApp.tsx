"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useCalendarStore, GOOGLE_CALENDAR_COLORS } from "./useCalendarStore";
import { useAccountingStore } from "@/components/accounting/useAccountingStore";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, type TransactionType } from "@/components/accounting/types";
import { useWarikanStore, calcSettlement } from "@/components/warikan/useWarikanStore";
import Link from "next/link";

// ── ユーティリティ ──────────────────────────────
function parseTime(slot: string) {
  const m = slot.match(/^(\d{1,2}:\d{2})~(\d{1,2}:\d{2})$/);
  return m ? { start: m[1], end: m[2] } : null;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function getDaysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }
function getFirstDow(y: number, m: number) { return new Date(y, m-1, 1).getDay(); }

const WEEKDAYS = ["日","月","火","水","木","金","土"];
type Tab = "calendar" | "settings";
type Status = { type: "success"|"error"; message: string } | null;
const AUTH_KEY = "accounting_authed";

// ── インライン追加プルダウン ───────────────────────
function AddableSelect({ value, options, placeholder, onChange, onAdd }: {
  value: string; options: string[]; placeholder?: string;
  onChange: (v: string) => void; onAdd: (v: string) => void;
}) {
  const ADD_KEY = "__add__";
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const handleSelect = (v: string) => {
    if (v === ADD_KEY) { setAdding(true); setDraft(""); setTimeout(() => ref.current?.focus(), 50); }
    else onChange(v);
  };
  const commit = () => {
    if (draft.trim()) { onAdd(draft.trim()); onChange(draft.trim()); }
    setAdding(false); setDraft("");
  };
  const base = "w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400";
  return (
    <div className="space-y-1">
      <select value={adding ? ADD_KEY : value} onChange={(e) => handleSelect(e.target.value)} className={base}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={ADD_KEY}>＋ 新しく追加...</option>
      </select>
      {adding && (
        <div className="flex gap-1">
          <input ref={ref} type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if(e.key==="Enter") commit(); if(e.key==="Escape"){ setAdding(false); setDraft(""); } }}
            placeholder={placeholder ?? "新しい項目名"}
            className="flex-1 border border-blue-300 dark:border-blue-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button type="button" onClick={commit} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg">追加</button>
          <button type="button" onClick={() => { setAdding(false); setDraft(""); }} className="px-2 py-1.5 text-gray-400 hover:text-gray-600 text-sm rounded-lg">✕</button>
        </div>
      )}
    </div>
  );
}

// ── イベント別収支パネル ───────────────────────────
function EventAccountingPanel({ calendarEntryId, entryLabel }: { calendarEntryId: string; entryLabel: string }) {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);
  const [open, setOpen] = useState(false);
  const { calendarEntryBalance, addTransaction, deleteTransaction } = useAccountingStore();
  const [form, setForm] = useState({ type: "expense" as TransactionType, category: EXPENSE_CATEGORIES[0], description: "", amount: "" });

  useEffect(() => {
    if (sessionStorage.getItem(AUTH_KEY) === "1") setAuthed(true);
  }, []);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === "Admin") { sessionStorage.setItem(AUTH_KEY,"1"); setAuthed(true); setPwErr(false); }
    else { setPwErr(true); setPw(""); }
  };

  const { income, expense, balance, txs } = calendarEntryBalance(calendarEntryId);
  const cats = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseInt(form.amount);
    if (!form.description.trim() || isNaN(amt) || amt <= 0) return;
    addTransaction({ date: todayStr(), type: form.type, category: form.category, description: form.description.trim(), amount: amt, calendarEntryId });
    setForm((f) => ({ ...f, description: "", amount: "" }));
  };

  return (
    <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2">
      <button onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors w-full">
        <span>💴</span>
        <span>収支</span>
        {txs.length > 0 && (
          <span className={`ml-auto font-semibold ${balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
            {balance >= 0 ? "+" : "−"}{Math.abs(balance).toLocaleString()}円
          </span>
        )}
        <span className="text-gray-300 dark:text-gray-600 ml-1">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {!authed ? (
            <form onSubmit={handleAuth} className="flex gap-2">
              <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setPwErr(false); }}
                placeholder="Adminパスワード"
                className={`flex-1 border rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 ${pwErr ? "border-red-400" : "border-gray-200 dark:border-gray-600"}`} />
              <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg">解錠</button>
            </form>
          ) : (
            <>
              {/* サマリー */}
              {txs.length > 0 && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["収入", income, "text-green-600 dark:text-green-400"],["支出", expense, "text-red-500 dark:text-red-400"],["収支", balance, balance>=0?"text-blue-600 dark:text-blue-400":"text-red-500"]].map(([label, val, cls]) => (
                    <div key={label as string} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg py-1.5">
                      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
                      <p className={`text-xs font-bold ${cls}`}>{(val as number).toLocaleString()}円</p>
                    </div>
                  ))}
                </div>
              )}

              {/* 取引一覧 */}
              {txs.map((tx) => (
                <div key={tx.id} className="flex items-center gap-2 text-xs group">
                  <span className={tx.type==="income"?"text-green-500":"text-red-400"}>{tx.type==="income"?"↑":"↓"}</span>
                  <span className="flex-1 text-gray-700 dark:text-gray-200 truncate">{tx.description}</span>
                  <span className={`font-semibold ${tx.type==="income"?"text-green-600 dark:text-green-400":"text-red-500 dark:text-red-400"}`}>
                    {tx.type==="income"?"+":"−"}{tx.amount.toLocaleString()}円
                  </span>
                  <button onClick={() => deleteTransaction(tx.id)}
                    className="text-gray-200 dark:text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all leading-none">×</button>
                </div>
              ))}

              {/* 追加フォーム */}
              <form onSubmit={handleAdd} className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-700">
                <div className="flex gap-1">
                  {(["expense","income"] as TransactionType[]).map((t) => (
                    <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, type: t, category: (t==="income"?INCOME_CATEGORIES:EXPENSE_CATEGORIES)[0] }))}
                      className={`flex-1 py-1 text-xs font-medium rounded-lg transition-colors ${form.type===t?(t==="income"?"bg-green-500 text-white":"bg-red-400 text-white"):"bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                      {t==="income"?"収入":"支出"}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400">
                    {cats.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input type="number" min={1} placeholder="金額（円）" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required
                    className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div className="flex gap-1">
                  <input type="text" placeholder="説明" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required
                    className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg">追加</button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── イベント別割り勘パネル ────────────────────────
function EventWarikanPanel({ calendarEntryId, eventName, eventDate }: {
  calendarEntryId: string; eventName: string; eventDate: string;
}) {
  const { sessionForCalendarEntry, createSession } = useWarikanStore();
  const [open, setOpen] = useState(false);
  const linked = sessionForCalendarEntry(calendarEntryId);
  const total = linked ? linked.items.reduce((s, i) => s + i.amount, 0) : 0;
  const { settlements } = linked ? calcSettlement(linked) : { settlements: [] };

  const handleCreate = () => {
    createSession({ name: eventName, date: eventDate, calendarEntryId });
  };

  return (
    <div className="mt-1 border-t border-gray-100 dark:border-gray-700 pt-2">
      <button onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors w-full">
        <span>💸</span>
        <span>割り勘</span>
        {linked && total > 0 && (
          <span className={`ml-auto font-semibold ${settlements.length === 0 ? "text-green-600 dark:text-green-400" : "text-indigo-600 dark:text-indigo-400"}`}>
            {total.toLocaleString()}円 {settlements.length === 0 ? "✓精算済" : `(${settlements.length}件未精算)`}
          </span>
        )}
        <span className="text-gray-300 dark:text-gray-600 ml-1">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {!linked ? (
            <button onClick={handleCreate}
              className="w-full py-1.5 border border-dashed border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
              ＋ このイベントの割り勘を作成
            </button>
          ) : (
            <div className="space-y-2">
              {/* サマリー */}
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg py-1.5">
                  <p className="text-xs text-gray-400 dark:text-gray-500">合計</p>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{total.toLocaleString()}円</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg py-1.5">
                  <p className="text-xs text-gray-400 dark:text-gray-500">人数</p>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200">{linked.participants.length}人</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg py-1.5">
                  <p className="text-xs text-gray-400 dark:text-gray-500">未精算</p>
                  <p className={`text-xs font-bold ${settlements.length === 0 ? "text-green-600 dark:text-green-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                    {settlements.length === 0 ? "なし" : `${settlements.length}件`}
                  </p>
                </div>
              </div>

              {/* 精算状況（未精算がある場合のみ） */}
              {settlements.length > 0 && (
                <div className="space-y-1">
                  {settlements.map((st, i) => {
                    const pname = (id: string) => linked.participants.find((p) => p.id === id)?.name ?? "?";
                    return (
                      <div key={i} className="flex items-center gap-1 px-2 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-xs">
                        <span className="font-medium text-indigo-700 dark:text-indigo-300">{pname(st.from)}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-medium text-indigo-700 dark:text-indigo-300">{pname(st.to)}</span>
                        <span className="ml-auto font-bold text-indigo-700 dark:text-indigo-300">{st.amount.toLocaleString()}円</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 割り勘ページへのリンク */}
              <Link href="/warikan"
                className="block w-full text-center py-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                割り勘ページで詳細を編集 →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── メインコンポーネント ─────────────────────────
export default function CalendarApp() {
  const { data: session } = useSession();
  const store = useCalendarStore();
  const { eventNames, addEventName, deleteEventName, timeSlots, addTimeSlot, deleteTimeSlot, addEntry, deleteEntry, entriesForDate } = store;

  const today = todayStr();
  const [viewYear, setViewYear]   = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("calendar");
  const [form, setForm] = useState({ eventName: eventNames[0] ?? "", timeSlot: timeSlots[0] ?? "", colorId: "7" });
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState<Status>(null);
  const [newEventName, setNewEventName] = useState("");
  const [newTimeSlot, setNewTimeSlot]   = useState("");

  const safeEventName = eventNames.includes(form.eventName) ? form.eventName : (eventNames[0] ?? "");
  const safeTimeSlot  = timeSlots.includes(form.timeSlot)   ? form.timeSlot  : (timeSlots[0]  ?? "");
  const selectedColor = GOOGLE_CALENDAR_COLORS.find((c) => c.id === form.colorId);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow    = getFirstDow(viewYear, viewMonth);
  const totalCells  = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const prevMonth = () => viewMonth===1  ? (setViewYear(y=>y-1), setViewMonth(12)) : setViewMonth(m=>m-1);
  const nextMonth = () => viewMonth===12 ? (setViewYear(y=>y+1), setViewMonth(1))  : setViewMonth(m=>m+1);

  const handleAdd = async () => {
    if (!selectedDate || !safeEventName || !safeTimeSlot) {
      setStatus({ type:"error", message:"日付・イベント名・時間を選択してください" }); return;
    }
    const times = parseTime(safeTimeSlot);
    if (!times) { setStatus({ type:"error", message:"時間の形式が正しくありません" }); return; }
    const entry = { date: selectedDate, eventName: safeEventName, timeSlot: safeTimeSlot, colorId: form.colorId };

    if (session?.access_token) {
      setLoading(true); setStatus(null);
      try {
        const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method:"POST",
          headers:{ Authorization:`Bearer ${session.access_token}`, "Content-Type":"application/json" },
          body: JSON.stringify({
            summary: safeEventName,
            start:{ dateTime:`${selectedDate}T${times.start}:00+09:00`, timeZone:"Asia/Tokyo" },
            end:  { dateTime:`${selectedDate}T${times.end}:00+09:00`,   timeZone:"Asia/Tokyo" },
            colorId: form.colorId,
          }),
        });
        if (!res.ok) { const e=await res.json(); throw new Error(e.error?.message ?? "APIエラー"); }
        setStatus({ type:"success", message:`Googleカレンダーに追加：${safeEventName} (${safeTimeSlot})` });
      } catch(e: unknown) {
        setStatus({ type:"error", message:`失敗：${e instanceof Error ? e.message : String(e)}` });
        setLoading(false); return;
      }
      setLoading(false);
    } else {
      setStatus({ type:"success", message:`追加：${safeEventName} (${safeTimeSlot})` });
    }
    addEntry(entry);
  };

  const selectedEntries = selectedDate ? entriesForDate(selectedDate) : [];

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">カレンダー</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">定常活動を管理します</p>
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
          {([["calendar","カレンダー"],["settings","設定"]] as const).map(([id,label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${tab===id?"bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm":"text-gray-500 dark:text-gray-400"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab==="calendar" && (session ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-xs text-green-700 dark:text-green-400">
          <span>✓</span><span>{session.user?.name} のGoogleカレンダーに追加されます</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl text-xs text-yellow-700 dark:text-yellow-400">
          <span>⚠</span><span>Googleログインするとカレンダーに自動追加されます</span>
        </div>
      ))}

      {/* ===== カレンダータブ ===== */}
      {tab==="calendar" && (
        <div className="space-y-4">
          {/* 月カレンダー */}
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
              <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors text-lg">‹</button>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{viewYear}年 {viewMonth}月</p>
              <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors text-lg">›</button>
            </div>
            <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
              {WEEKDAYS.map((d,i) => (
                <div key={d} className={`py-2 text-center text-xs font-medium ${i===0?"text-red-400":i===6?"text-blue-400":"text-gray-400 dark:text-gray-500"}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: totalCells }).map((_,idx) => {
                const day = idx - firstDow + 1;
                const isValid = day >= 1 && day <= daysInMonth;
                const dateStr = isValid ? ymd(viewYear, viewMonth, day) : "";
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDate;
                const dow = idx % 7;
                const dayEntries = isValid ? entriesForDate(dateStr) : [];
                return (
                  <div key={idx} onClick={() => isValid && setSelectedDate(isSelected ? null : dateStr)}
                    className={`min-h-[64px] p-1 border-b border-r border-gray-50 dark:border-gray-700/50 transition-colors ${isValid?"cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40":""} ${isSelected?"bg-blue-50 dark:bg-blue-900/20":""}`}>
                    {isValid && (<>
                      <div className="flex justify-end mb-1">
                        <span className={`w-6 h-6 flex items-center justify-center text-xs rounded-full font-medium ${isToday?"bg-blue-600 text-white":dow===0?"text-red-400":dow===6?"text-blue-400":"text-gray-700 dark:text-gray-200"}`}>{day}</span>
                      </div>
                      <div className="space-y-0.5">
                        {dayEntries.slice(0,2).map((e) => {
                          const color = GOOGLE_CALENDAR_COLORS.find((c) => c.id === e.colorId);
                          return (
                            <div key={e.id} className="flex items-center gap-1 px-1 py-0.5 rounded truncate"
                              style={{ backgroundColor: color ? color.hex+"22" : "#e5e7eb" }}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color?.hex ?? "#9ca3af" }} />
                              <span className="truncate text-gray-700 dark:text-gray-200" style={{ fontSize:"10px" }}>{e.eventName}</span>
                            </div>
                          );
                        })}
                        {dayEntries.length > 2 && <p className="text-gray-400 dark:text-gray-500" style={{ fontSize:"10px", paddingLeft:"4px" }}>+{dayEntries.length-2}</p>}
                      </div>
                    </>)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 選択日パネル */}
          {selectedDate && (
            <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {selectedDate.replace(/-/g,"/")}
                  <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                    {WEEKDAYS[new Date(selectedDate).getDay()]}曜日
                  </span>
                </p>
                <button onClick={() => setSelectedDate(null)} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 text-lg leading-none">×</button>
              </div>

              {/* この日のイベント一覧（収支パネル付き） */}
              {selectedEntries.length > 0 && (
                <div className="space-y-2">
                  {selectedEntries.map((e) => {
                    const color = GOOGLE_CALENDAR_COLORS.find((c) => c.id === e.colorId);
                    return (
                      <div key={e.id} className="rounded-lg px-3 py-2 group"
                        style={{ backgroundColor: color ? color.hex+"15" : "#f9fafb" }}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color?.hex ?? "#9ca3af" }} />
                          <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100">{e.eventName}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{e.timeSlot}</span>
                          <button onClick={() => deleteEntry(e.id)}
                            className="text-gray-200 dark:text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-base leading-none ml-1">×</button>
                        </div>
                        {/* イベント別収支（Adminのみ） */}
                        <EventAccountingPanel
                          calendarEntryId={e.id}
                          entryLabel={`${e.eventName} ${e.timeSlot}`}
                        />
                        {/* イベント別割り勘 */}
                        <EventWarikanPanel
                          calendarEntryId={e.id}
                          eventName={e.eventName}
                          eventDate={selectedDate!}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 新規イベント追加フォーム */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">予定を追加</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">イベント名</label>
                    <AddableSelect value={safeEventName} options={eventNames} placeholder="例：新しい会場名"
                      onChange={(v) => setForm((f) => ({ ...f, eventName: v }))} onAdd={(v) => addEventName(v)} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">時間</label>
                    <AddableSelect value={safeTimeSlot} options={timeSlots} placeholder="例：19:00~22:00"
                      onChange={(v) => setForm((f) => ({ ...f, timeSlot: v }))} onAdd={(v) => addTimeSlot(v)} />
                  </div>
                </div>
                {session && (
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">色</label>
                    <div className="relative">
                      <select value={form.colorId} onChange={(e) => setForm((f) => ({ ...f, colorId: e.target.value }))}
                        className="w-full border border-gray-200 dark:border-gray-600 rounded-lg pl-8 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none">
                        {GOOGLE_CALENDAR_COLORS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {selectedColor && <span className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full pointer-events-none" style={{ backgroundColor: selectedColor.hex }} />}
                    </div>
                  </div>
                )}
                <button onClick={handleAdd} disabled={loading || !eventNames.length || !timeSlots.length}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition-colors">
                  {loading ? "追加中..." : session ? "Googleカレンダーに追加" : "追加"}
                </button>
                {status && (
                  <div className={`px-3 py-2 rounded-lg text-xs ${status.type==="success"?"bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800":"bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800"}`}>
                    {status.message}
                  </div>
                )}
              </div>
            </div>
          )}
          {!selectedDate && <p className="text-center text-xs text-gray-400 dark:text-gray-500">日付をタップして予定を追加できます</p>}
        </div>
      )}

      {/* ===== 設定タブ ===== */}
      {tab==="settings" && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">イベント名</h2>
            <ul className="space-y-1">
              {eventNames.map((n) => (
                <li key={n} className="flex items-center gap-2 group">
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 rounded-lg">{n}</span>
                  <button onClick={() => deleteEventName(n)} className="text-gray-300 dark:text-gray-600 hover:text-red-400 text-lg leading-none opacity-0 group-hover:opacity-100 transition-all px-1">×</button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input type="text" placeholder="新しいイベント名" value={newEventName} onChange={(e) => setNewEventName(e.target.value)}
                onKeyDown={(e) => { if(e.key==="Enter"){ addEventName(newEventName); setNewEventName(""); } }}
                className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <button onClick={() => { addEventName(newEventName); setNewEventName(""); }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">追加</button>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">時間スロット</h2>
            <ul className="space-y-1">
              {timeSlots.map((s) => (
                <li key={s} className="flex items-center gap-2 group">
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 rounded-lg font-mono">{s}</span>
                  <button onClick={() => deleteTimeSlot(s)} className="text-gray-300 dark:text-gray-600 hover:text-red-400 text-lg leading-none opacity-0 group-hover:opacity-100 transition-all px-1">×</button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input type="text" placeholder="例：19:00~22:00" value={newTimeSlot} onChange={(e) => setNewTimeSlot(e.target.value)}
                onKeyDown={(e) => { if(e.key==="Enter"){ addTimeSlot(newTimeSlot); setNewTimeSlot(""); } }}
                className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono" />
              <button onClick={() => { addTimeSlot(newTimeSlot); setNewTimeSlot(""); }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">追加</button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">形式：HH:MM~HH:MM（例：18:00~21:00）</p>
          </div>
        </div>
      )}
    </div>
  );
}
