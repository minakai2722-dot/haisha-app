"use client";

import { useState } from "react";
import { useWarikanStore, calcSettlement, uuid, type WarikanSession } from "./useWarikanStore";

// ── セッション一覧 ─────────────────────────────
function SessionList({ sessions, onSelect, onCreate, onDelete }: {
  sessions: WarikanSession[];
  onSelect: (s: WarikanSession) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <button onClick={onCreate}
        className="w-full py-2.5 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-400 dark:text-gray-500 hover:border-indigo-300 hover:text-indigo-500 transition-colors">
        ＋ 新しい割り勘を作成
      </button>
      {sessions.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-8 text-center text-gray-400 text-sm">
          割り勘がありません
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
          <ul className="divide-y divide-gray-50 dark:divide-gray-700">
            {sessions.map((s) => {
              const total = s.items.reduce((sum, i) => sum + i.amount, 0);
              const { settlements } = calcSettlement(s);
              return (
                <li key={s.id} className="flex items-center px-5 py-3 gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 group transition-colors"
                  onClick={() => onSelect(s)}>
                  <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-lg flex-shrink-0">💸</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{s.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {s.date} · {s.participants.length}人 · {s.items.length}件
                      {s.calendarEntryId && <span className="ml-1 text-indigo-400">📅</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{total.toLocaleString()}円</p>
                    <p className={`text-xs ${settlements.length === 0 && s.items.length > 0 ? "text-green-500" : "text-gray-400 dark:text-gray-500"}`}>
                      {s.items.length === 0 ? "未入力" : settlements.length === 0 ? "精算完了" : `${settlements.length}件未精算`}
                    </p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                    className="text-gray-200 dark:text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-lg leading-none ml-1">×</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── セッション詳細 ─────────────────────────────
function SessionDetail({ session, onUpdate, onBack }: {
  session: WarikanSession;
  onUpdate: (s: WarikanSession) => void;
  onBack: () => void;
}) {
  const s = session;
  const [newMemberName, setNewMemberName] = useState("");
  const [itemForm, setItemForm] = useState({
    description: "", amount: "",
    payerId: s.participants[0]?.id ?? "",
    splitWith: [] as string[],
  });
  const [tab, setTab] = useState<"input" | "result">("input");

  const update = (patch: Partial<WarikanSession>) => onUpdate({ ...s, ...patch });

  const addMember = () => {
    const name = newMemberName.trim();
    if (!name) return;
    const newP = { id: uuid(), name };
    const updated = { ...s, participants: [...s.participants, newP] };
    update(updated);
    setNewMemberName("");
    if (!itemForm.payerId) setItemForm((f) => ({ ...f, payerId: newP.id }));
  };

  const deleteMember = (id: string) => {
    update({
      participants: s.participants.filter((p) => p.id !== id),
      items: s.items
        .filter((i) => i.payerId !== id)
        .map((i) => ({ ...i, splitWith: i.splitWith.filter((sid) => sid !== id) })),
    });
  };

  const addItem = () => {
    const amount = parseInt(itemForm.amount);
    if (!itemForm.description.trim() || isNaN(amount) || amount <= 0 || !itemForm.payerId) return;
    update({ items: [...s.items, { id: uuid(), description: itemForm.description.trim(), amount, payerId: itemForm.payerId, splitWith: itemForm.splitWith }] });
    setItemForm((f) => ({ ...f, description: "", amount: "", splitWith: [] }));
  };

  const deleteItem = (id: string) => update({ items: s.items.filter((i) => i.id !== id) });

  const toggleSplit = (pid: string) => {
    setItemForm((f) => ({
      ...f,
      splitWith: f.splitWith.includes(pid) ? f.splitWith.filter((id) => id !== pid) : [...f.splitWith, pid],
    }));
  };

  const pname = (id: string) => s.participants.find((p) => p.id === id)?.name ?? "?";
  const { settlements, balances } = calcSettlement(s);
  const totalAmount = s.items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">‹</button>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">{s.name}</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {s.date} · 合計 {totalAmount.toLocaleString()}円
            {s.calendarEntryId && <span className="ml-1 text-indigo-400">📅カレンダー連携中</span>}
          </p>
        </div>
      </div>

      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
        {([["input","入力"],["result","精算結果"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${tab === id ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 入力タブ */}
      {tab === "input" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">参加者</h3>
            <div className="flex flex-wrap gap-2">
              {s.participants.map((p) => (
                <span key={p.id} className="flex items-center gap-1 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-sm">
                  {p.name}
                  <button onClick={() => deleteMember(p.id)} className="text-indigo-300 hover:text-red-400 text-base leading-none ml-1">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" placeholder="名前を入力" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addMember(); }}
                className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={addMember} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg">追加</button>
            </div>
          </div>

          {s.items.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 px-4 py-3 border-b border-gray-100 dark:border-gray-700">支払い一覧</p>
              <ul className="divide-y divide-gray-50 dark:divide-gray-700">
                {s.items.map((item) => {
                  const targets = item.splitWith.length > 0 ? item.splitWith.map(pname) : s.participants.map((p) => p.name);
                  const perPerson = targets.length > 0 ? Math.ceil(item.amount / targets.length) : item.amount;
                  return (
                    <li key={item.id} className="flex items-center px-4 py-3 gap-3 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{item.description}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {pname(item.payerId)}が立替 · {targets.join("・")}で割り勘
                          <span className="ml-1 text-indigo-500 dark:text-indigo-400">({perPerson.toLocaleString()}円/人)</span>
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.amount.toLocaleString()}円</p>
                      <button onClick={() => deleteItem(item.id)}
                        className="text-gray-200 dark:text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-lg leading-none">×</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {s.participants.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">支払いを追加</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">内容</label>
                  <input type="text" placeholder="例：居酒屋代" value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">金額（円）</label>
                  <input type="number" min={1} placeholder="例：5000" value={itemForm.amount} onChange={(e) => setItemForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">支払った人</label>
                <select value={itemForm.payerId} onChange={(e) => setItemForm((f) => ({ ...f, payerId: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {s.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">割り勘対象（未選択 = 全員）</label>
                <div className="flex flex-wrap gap-2">
                  {s.participants.map((p) => (
                    <button key={p.id} type="button" onClick={() => toggleSplit(p.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${itemForm.splitWith.includes(p.id) ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
                {itemForm.splitWith.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">→ 全員（{s.participants.length}人）で割り勘</p>
                )}
              </div>
              <button onClick={addItem} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg">追加</button>
            </div>
          )}
        </div>
      )}

      {/* 精算結果タブ */}
      {tab === "result" && (
        <div className="space-y-4">
          {s.participants.length === 0 || s.items.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-8 text-center text-gray-400 text-sm">
              参加者と支払いを入力してください
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">合計</p>
                  <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{totalAmount.toLocaleString()}円</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {s.participants.map((p) => {
                    const bal = balances[p.id] ?? 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <span className="text-sm text-gray-700 dark:text-gray-200">{p.name}</span>
                        <span className={`text-sm font-semibold ${bal > 0.5 ? "text-green-600 dark:text-green-400" : bal < -0.5 ? "text-red-500 dark:text-red-400" : "text-gray-400"}`}>
                          {bal > 0.5 ? `+${Math.round(bal).toLocaleString()}` : Math.round(bal).toLocaleString()}円
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">+ = 受け取り / − = 支払い</p>
              </div>

              <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">精算方法</p>
                {settlements.length === 0 ? (
                  <p className="text-sm text-green-600 dark:text-green-400 text-center py-4">全員精算済みです！</p>
                ) : settlements.map((st, i) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                    <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{pname(st.from)}</span>
                    <span className="text-gray-400 text-xs">→</span>
                    <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{pname(st.to)}</span>
                    <span className="ml-auto text-sm font-bold text-indigo-700 dark:text-indigo-300">{st.amount.toLocaleString()}円</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── メインコンポーネント ─────────────────────────
export default function WarikanApp({ initialSessionId }: { initialSessionId?: string } = {}) {
  const { sessions, createSession, updateSession, deleteSession } = useWarikanStore();
  const [selected, setSelected] = useState<WarikanSession | null>(() => {
    if (initialSessionId) return null; // will be set after sessions load
    return null;
  });

  // initialSessionId が指定された場合、対応するセッションを選択
  const targetSession = initialSessionId ? sessions.find((s) => s.id === initialSessionId) ?? null : null;
  const displaySession = selected ?? targetSession;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">割り勘</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">支払いを記録して精算金額を計算します</p>
      </div>

      {displaySession ? (
        <SessionDetail
          session={sessions.find((s) => s.id === displaySession.id) ?? displaySession}
          onUpdate={updateSession}
          onBack={() => setSelected(null)}
        />
      ) : (
        <SessionList
          sessions={sessions}
          onSelect={setSelected}
          onCreate={() => { const s = createSession(); setSelected(s); }}
          onDelete={deleteSession}
        />
      )}
    </div>
  );
}
