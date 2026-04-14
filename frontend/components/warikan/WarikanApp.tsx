"use client";

import { useState } from "react";
import {
  useWarikanStore, calcSettlement, uuid, todayStr,
  type WarikanSession, type Participant, type PayItem,
} from "./useWarikanStore";
import { useCalendarStore } from "@/components/calendar/useCalendarStore";

// ── カラーパレット（メンバーチップ用） ────────────────
const COLORS = [
  { bg: "bg-rose-400",    light: "bg-rose-100 dark:bg-rose-900/40",    text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-blue-500",    light: "bg-blue-100 dark:bg-blue-900/40",    text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-emerald-500", light: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-amber-400",   light: "bg-amber-100 dark:bg-amber-900/40",  text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-purple-500",  light: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300" },
  { bg: "bg-cyan-500",    light: "bg-cyan-100 dark:bg-cyan-900/40",    text: "text-cyan-700 dark:text-cyan-300" },
  { bg: "bg-pink-400",    light: "bg-pink-100 dark:bg-pink-900/40",    text: "text-pink-700 dark:text-pink-300" },
  { bg: "bg-indigo-500",  light: "bg-indigo-100 dark:bg-indigo-900/40", text: "text-indigo-700 dark:text-indigo-300" },
];
function colorOf(idx: number) { return COLORS[idx % COLORS.length]; }

// ── メンバーチップ ────────────────────────────────
function MemberChip({
  name, index, size = "md", selected, onToggle, role,
}: {
  name: string; index: number; size?: "sm" | "md" | "lg";
  selected?: boolean; onToggle?: () => void; role?: "payer" | "target";
}) {
  const c = colorOf(index);
  const initial = name.slice(0, 1);
  const sizeClass = size === "sm" ? "w-9 h-9 text-sm" : size === "lg" ? "w-14 h-14 text-xl" : "w-12 h-12 text-base";
  const labelClass = size === "sm" ? "text-xs" : "text-xs";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex flex-col items-center gap-1 transition-all ${onToggle ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className={`${sizeClass} rounded-full flex items-center justify-center font-bold relative transition-all
        ${selected
          ? `${c.bg} text-white ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-800 ${role === "payer" ? "ring-yellow-400" : "ring-white"}`
          : `${c.light} ${c.text}`
        }`}>
        {initial}
        {selected && role === "payer" && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center text-xs">★</span>
        )}
        {selected && role === "target" && (
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-xs border border-gray-200 dark:border-gray-600">✓</span>
        )}
      </div>
      <span className={`${labelClass} text-gray-600 dark:text-gray-300 max-w-[48px] truncate leading-tight`}>{name}</span>
    </button>
  );
}

// ── 数字パッド ────────────────────────────────────
function NumPad({ value, onChange, onConfirm }: {
  value: string; onChange: (v: string) => void; onConfirm: () => void;
}) {
  const press = (key: string) => {
    if (key === "C") { onChange(""); return; }
    if (key === "⌫") { onChange(value.slice(0, -1)); return; }
    if (key === "000") { if (value) onChange(value + "000"); return; }
    if (value.length >= 8) return;
    if (key === "0" && value === "") return;
    onChange(value + key);
  };

  const display = value ? parseInt(value).toLocaleString("ja-JP") : "0";

  return (
    <div className="space-y-3">
      {/* 表示エリア */}
      <div className="bg-gray-50 dark:bg-gray-700/60 rounded-2xl px-5 py-4 text-right">
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">¥</span>
        <span className="text-3xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">{display}</span>
      </div>
      {/* キーパッド */}
      <div className="grid grid-cols-3 gap-2">
        {["1","2","3","4","5","6","7","8","9","C","0","⌫"].map((k) => (
          <button key={k} type="button" onClick={() => press(k)}
            className={`py-3.5 rounded-xl text-lg font-semibold transition-all active:scale-95 ${
              k === "C" ? "bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50"
              : k === "⌫" ? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700 shadow-sm"
            }`}>
            {k}
          </button>
        ))}
      </div>
      <button type="button" onClick={onConfirm}
        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-base rounded-xl transition-all active:scale-[.98]">
        追加
      </button>
    </div>
  );
}

// ── 支払い追加フォーム ─────────────────────────────
function AddPaymentPanel({ participants, onAdd, onCancel }: {
  participants: Participant[];
  onAdd: (item: Omit<PayItem, "id">) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"payer" | "targets" | "amount">("payer");
  const [payerId, setPayerId] = useState<string>("");
  const [targets, setTargets] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");

  const toggleTarget = (id: string) => {
    setTargets((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };
  const allSelected = participants.every((p) => targets.includes(p.id));
  const toggleAll = () => setTargets(allSelected ? [] : participants.map((p) => p.id));

  const handleConfirm = () => {
    const amt = parseInt(amount);
    if (!payerId || isNaN(amt) || amt <= 0) return;
    onAdd({ description: desc.trim() || "支払い", amount: amt, payerId, splitWith: targets });
  };

  const perPerson = (() => {
    const amt = parseInt(amount);
    const n = targets.length > 0 ? targets.length : participants.length;
    return !isNaN(amt) && amt > 0 && n > 0 ? Math.ceil(amt / n) : null;
  })();

  const pname = (id: string) => participants.find((p) => p.id === id)?.name ?? "?";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-5 space-y-5 pb-8"
        onClick={(e) => e.stopPropagation()}>

        {/* ハンドル */}
        <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto" />

        {/* ステップインジケーター */}
        <div className="flex items-center gap-2 justify-center">
          {(["payer","targets","amount"] as const).map((s, i) => (
            <div key={s} className={`flex items-center gap-2`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s ? "bg-indigo-600 text-white" :
                (s === "payer" && payerId) || (s === "targets") || (s === "amount" && parseInt(amount) > 0)
                  ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400"
              }`}>{i + 1}</div>
              {i < 2 && <div className="w-8 h-0.5 bg-gray-100 dark:bg-gray-800" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: 支払い人 ── */}
        {step === "payer" && (
          <div className="space-y-4">
            <p className="text-base font-semibold text-gray-800 dark:text-gray-100 text-center">誰が支払いましたか？</p>
            <div className="flex flex-wrap gap-4 justify-center py-2">
              {participants.map((p, i) => (
                <MemberChip key={p.id} name={p.name} index={i} size="lg"
                  selected={payerId === p.id} role="payer"
                  onToggle={() => { setPayerId(p.id); setStep("targets"); if (targets.length === 0) setTargets(participants.map((pp) => pp.id)); }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: 対象者 ── */}
        {step === "targets" && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-base font-semibold text-gray-800 dark:text-gray-100">誰が使いましたか？</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{pname(payerId)} が立替</p>
            </div>
            <div className="flex flex-wrap gap-4 justify-center py-2">
              {participants.map((p, i) => (
                <MemberChip key={p.id} name={p.name} index={i} size="lg"
                  selected={targets.includes(p.id)} role="target"
                  onToggle={() => toggleTarget(p.id)} />
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={toggleAll}
                className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {allSelected ? "全員解除" : "全員選択"}
              </button>
              <button type="button" onClick={() => setStep("amount")}
                disabled={targets.length === 0}
                className="flex-1 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 text-white font-semibold rounded-xl transition-colors">
                次へ →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: 金額 ── */}
        {step === "amount" && (
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-base font-semibold text-gray-800 dark:text-gray-100">金額を入力</p>
              {perPerson && (
                <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-0.5">
                  {targets.length > 0 ? targets.map(pname).join("・") : "全員"} で割り勘
                  → {perPerson.toLocaleString()}円 / 人
                </p>
              )}
            </div>
            <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="内容（例：居酒屋代）"
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <NumPad value={amount} onChange={setAmount} onConfirm={handleConfirm} />
          </div>
        )}

        {/* 戻るボタン */}
        {step !== "payer" && (
          <button type="button" onClick={() => setStep(step === "amount" ? "targets" : "payer")}
            className="w-full py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            ← 戻る
          </button>
        )}
      </div>
    </div>
  );
}

// ── 新規作成フォーム ─────────────────────────────
function CreateSessionForm({ eventNames, timeSlots, onSubmit, onCancel }: {
  eventNames: string[];
  timeSlots: string[];
  onSubmit: (name: string, date: string, timeSlot: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(eventNames[0] ?? "");
  const [customName, setCustomName] = useState("");
  const [useCustom, setUseCustom] = useState(eventNames.length === 0);
  const [date, setDate] = useState(todayStr());
  const [timeSlot, setTimeSlot] = useState(timeSlots[0] ?? "");

  const resolvedName = useCustom ? customName.trim() : name;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedName || !date) return;
    onSubmit(resolvedName, date, timeSlot);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-5 space-y-4 pb-8"
        onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto" />
        <p className="text-base font-bold text-gray-800 dark:text-gray-100 text-center">新しい割り勘</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* イベント名 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">イベント名</label>
            {!useCustom && eventNames.length > 0 ? (
              <div className="flex gap-2">
                <select value={name} onChange={(e) => setName(e.target.value)}
                  className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {eventNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <button type="button" onClick={() => setUseCustom(true)}
                  className="px-3 py-2 text-xs border border-gray-200 dark:border-gray-600 rounded-xl text-gray-400 hover:text-indigo-500 hover:border-indigo-300 transition-colors">
                  その他
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="text" value={customName} onChange={(e) => setCustomName(e.target.value)}
                  placeholder="イベント名を入力"
                  className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                {eventNames.length > 0 && (
                  <button type="button" onClick={() => { setUseCustom(false); setCustomName(""); }}
                    className="px-3 py-2 text-xs border border-gray-200 dark:border-gray-600 rounded-xl text-gray-400 hover:text-indigo-500 hover:border-indigo-300 transition-colors">
                    一覧
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 日付 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">日付</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          {/* 時間帯 */}
          {timeSlots.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">時間帯（任意）</label>
              <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">指定なし</option>
                {timeSlots.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          <button type="submit" disabled={!resolvedName || !date}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 text-white font-bold text-sm rounded-xl transition-all">
            作成
          </button>
        </form>

        <button type="button" onClick={onCancel}
          className="w-full py-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          キャンセル
        </button>
      </div>
    </div>
  );
}

// ── セッション一覧 ─────────────────────────────
function SessionList({ sessions, eventNames, timeSlots, onSelect, onCreate, onDelete }: {
  sessions: WarikanSession[];
  eventNames: string[];
  timeSlots: string[];
  onSelect: (s: WarikanSession) => void;
  onCreate: (name: string, date: string, timeSlot: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm(true)}
        className="w-full py-4 border-2 border-dashed border-indigo-200 dark:border-indigo-800 rounded-2xl text-sm font-medium text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
        ＋ 新しい割り勘を作成
      </button>

      {showForm && (
        <CreateSessionForm
          eventNames={eventNames}
          timeSlots={timeSlots}
          onSubmit={(name, date, timeSlot) => { onCreate(name, date, timeSlot); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {sessions.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-10 text-center">
          <p className="text-4xl mb-3">💸</p>
          <p className="text-sm text-gray-400">割り勘がありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const total = s.items.reduce((sum, i) => sum + i.amount, 0);
            const { settlements } = calcSettlement(s);
            const settled = s.items.length > 0 && settlements.length === 0;
            return (
              <div key={s.id}
                className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all group"
                onClick={() => onSelect(s)}>
                <div className="w-11 h-11 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-xl flex-shrink-0">💸</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{s.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-gray-400 dark:text-gray-500">{s.date}</p>
                    <div className="flex -space-x-1">
                      {s.participants.slice(0, 4).map((p, i) => (
                        <div key={p.id} className={`w-5 h-5 rounded-full ${colorOf(i).bg} flex items-center justify-center text-white text-xs font-bold border border-white dark:border-gray-800`}>
                          {p.name.slice(0, 1)}
                        </div>
                      ))}
                      {s.participants.length > 4 && <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs text-gray-500 border border-white dark:border-gray-800">+{s.participants.length - 4}</div>}
                    </div>
                    {s.calendarEntryId && <span className="text-indigo-400 text-xs">📅</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-bold text-gray-800 dark:text-gray-100">{total.toLocaleString()}円</p>
                  <p className={`text-xs font-medium ${settled ? "text-green-500" : s.items.length === 0 ? "text-gray-400" : "text-indigo-500"}`}>
                    {s.items.length === 0 ? "未入力" : settled ? "✓ 精算完了" : `${settlements.length}件未精算`}
                  </p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  className="text-gray-200 dark:text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xl leading-none ml-1">×</button>
              </div>
            );
          })}
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
  const [tab, setTab] = useState<"input" | "result">("input");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [rounding, setRounding] = useState<"ceil" | "floor" | "round">("ceil");

  const update = (patch: Partial<WarikanSession>) => onUpdate({ ...s, ...patch });

  const addMember = () => {
    const name = newMemberName.trim();
    if (!name) return;
    update({ participants: [...s.participants, { id: uuid(), name }] });
    setNewMemberName(""); setShowAddMember(false);
  };
  const deleteMember = (id: string) => {
    update({
      participants: s.participants.filter((p) => p.id !== id),
      items: s.items.filter((i) => i.payerId !== id).map((i) => ({ ...i, splitWith: i.splitWith.filter((sid) => sid !== id) })),
    });
  };

  const addItem = (item: Omit<PayItem, "id">) => {
    update({ items: [...s.items, { ...item, id: uuid() }] });
    setShowAddPayment(false);
  };
  const deleteItem = (id: string) => update({ items: s.items.filter((i) => i.id !== id) });

  const pname = (id: string) => s.participants.find((p) => p.id === id)?.name ?? "?";
  const pidx  = (id: string) => s.participants.findIndex((p) => p.id === id);

  const { settlements, balances } = calcSettlement(s);
  const totalAmount = s.items.reduce((sum, i) => sum + i.amount, 0);

  const roundFn = rounding === "ceil" ? Math.ceil : rounding === "floor" ? Math.floor : Math.round;
  const adjustedSettlements = settlements.map((st) => ({ ...st, amount: roundFn(st.amount) })).filter((st) => st.amount > 0);

  return (
    <div className="space-y-4 pb-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-lg">‹</button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 truncate">{s.name}</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">{s.date} · {s.participants.length}人 · {totalAmount.toLocaleString()}円</p>
        </div>
      </div>

      {/* メンバーチップ一覧 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4">
        <div className="flex flex-wrap gap-3 items-center">
          {s.participants.map((p, i) => (
            <div key={p.id} className="flex flex-col items-center gap-1 group relative">
              <div className={`w-11 h-11 rounded-full ${colorOf(i).bg} flex items-center justify-center text-white font-bold text-base`}>
                {p.name.slice(0,1)}
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[44px] truncate">{p.name}</span>
              <button onClick={() => deleteMember(p.id)}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-400 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all leading-none">×</button>
            </div>
          ))}
          {/* メンバー追加 */}
          {showAddMember ? (
            <div className="flex items-center gap-1">
              <input type="text" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => { if(e.key==="Enter") addMember(); if(e.key==="Escape"){ setShowAddMember(false); setNewMemberName(""); } }}
                autoFocus placeholder="名前"
                className="w-20 border border-indigo-300 dark:border-indigo-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <button onClick={addMember} className="w-8 h-8 bg-indigo-600 rounded-lg text-white text-sm flex items-center justify-center">✓</button>
            </div>
          ) : (
            <button onClick={() => setShowAddMember(true)}
              className="w-11 h-11 rounded-full border-2 border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:border-indigo-300 hover:text-indigo-400 transition-colors text-xl">
              +
            </button>
          )}
        </div>
      </div>

      {/* タブ */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 gap-1">
        {([["input","支払い"],["result","精算結果"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${tab===id ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm" : "text-gray-400 dark:text-gray-500"}`}>
            {label}
            {id === "result" && adjustedSettlements.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-indigo-500 text-white rounded-full text-xs">{adjustedSettlements.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ===== 支払いタブ ===== */}
      {tab === "input" && (
        <div className="space-y-3">
          {s.items.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-8 text-center">
              <p className="text-3xl mb-2">🧾</p>
              <p className="text-sm text-gray-400">支払いを追加してください</p>
            </div>
          ) : (
            <div className="space-y-2">
              {s.items.map((item) => {
                const targets = item.splitWith.length > 0 ? item.splitWith : s.participants.map((p) => p.id);
                const perPerson = targets.length > 0 ? Math.ceil(item.amount / targets.length) : item.amount;
                const payerIdx = pidx(item.payerId);
                return (
                  <div key={item.id} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 flex items-center gap-3 group">
                    <div className={`w-10 h-10 rounded-full ${colorOf(payerIdx).bg} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                      {pname(item.payerId).slice(0,1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.description}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="text-xs text-gray-400 dark:text-gray-500">{pname(item.payerId)}が立替</p>
                        <span className="text-gray-200 dark:text-gray-700">·</span>
                        <div className="flex -space-x-1">
                          {targets.slice(0,5).map((tid) => {
                            const ti = pidx(tid);
                            return <div key={tid} className={`w-4 h-4 rounded-full ${colorOf(ti).bg} border border-white dark:border-gray-800 flex items-center justify-center text-white text-xs`}>{pname(tid).slice(0,1)}</div>;
                          })}
                          {targets.length > 5 && <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 border border-white dark:border-gray-800 text-xs flex items-center justify-center text-gray-500">+{targets.length-5}</div>}
                        </div>
                        <span className="text-xs text-indigo-500 dark:text-indigo-400">{perPerson.toLocaleString()}円/人</span>
                      </div>
                    </div>
                    <p className="text-base font-bold text-gray-800 dark:text-gray-100 flex-shrink-0">{item.amount.toLocaleString()}円</p>
                    <button onClick={() => deleteItem(item.id)}
                      className="text-gray-200 dark:text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xl leading-none ml-1">×</button>
                  </div>
                );
              })}
            </div>
          )}

          {s.participants.length >= 2 && (
            <button onClick={() => setShowAddPayment(true)}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm rounded-2xl transition-all active:scale-[.98]">
              ＋ 支払いを追加
            </button>
          )}
          {s.participants.length < 2 && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500">参加者を2人以上追加してください</p>
          )}
        </div>
      )}

      {/* ===== 精算結果タブ ===== */}
      {tab === "result" && (
        <div className="space-y-4">
          {s.items.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-8 text-center">
              <p className="text-3xl mb-2">🔢</p>
              <p className="text-sm text-gray-400">支払いを入力してください</p>
            </div>
          ) : (
            <>
              {/* 端数設定 */}
              <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 flex items-center gap-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">端数</p>
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-0.5 gap-0.5">
                  {([["ceil","切り上げ"],["round","四捨五入"],["floor","切り捨て"]] as const).map(([v,label]) => (
                    <button key={v} onClick={() => setRounding(v)}
                      className={`px-2.5 py-1 text-xs rounded-lg transition-all ${rounding===v ? "bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 font-semibold shadow-sm" : "text-gray-400 dark:text-gray-500"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 各自の収支 */}
              <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">立替状況</p>
                {s.participants.map((p, i) => {
                  const bal = balances[p.id] ?? 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${colorOf(i).bg} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                        {p.name.slice(0,1)}
                      </div>
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{p.name}</span>
                      <div className="text-right">
                        <span className={`text-sm font-bold ${bal > 0.5 ? "text-green-600 dark:text-green-400" : bal < -0.5 ? "text-red-500 dark:text-red-400" : "text-gray-400"}`}>
                          {bal > 0.5 ? `+${roundFn(bal).toLocaleString()}` : roundFn(bal).toLocaleString()}円
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 精算方法 */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 px-1">精算方法</p>
                {adjustedSettlements.length === 0 ? (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-6 text-center">
                    <p className="text-2xl mb-1">✅</p>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">全員精算済みです！</p>
                  </div>
                ) : adjustedSettlements.map((st, i) => {
                  const fromIdx = pidx(st.from);
                  const toIdx   = pidx(st.to);
                  return (
                    <div key={i} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-5 py-4 flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${colorOf(fromIdx).bg} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                        {pname(st.from).slice(0,1)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                          <span>{pname(st.from)}</span>
                          <span className="text-gray-300 dark:text-gray-600 mx-2">→</span>
                          <span>{pname(st.to)}</span>
                        </p>
                      </div>
                      <div className={`w-10 h-10 rounded-full ${colorOf(toIdx).bg} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                        {pname(st.to).slice(0,1)}
                      </div>
                      <p className="text-lg font-bold text-gray-800 dark:text-gray-100 ml-2">{st.amount.toLocaleString()}円</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* 支払い追加モーダル */}
      {showAddPayment && (
        <AddPaymentPanel
          participants={s.participants}
          onAdd={addItem}
          onCancel={() => setShowAddPayment(false)}
        />
      )}
    </div>
  );
}

// ── メインコンポーネント ─────────────────────────
export default function WarikanApp({ initialSessionId }: { initialSessionId?: string } = {}) {
  const { sessions, createSession, updateSession, deleteSession } = useWarikanStore();
  const { eventNames, timeSlots, addEntry } = useCalendarStore();
  const [selectedId, setSelectedId] = useState<string | null>(initialSessionId ?? null);
  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  const handleCreate = (name: string, date: string, timeSlot: string) => {
    const calendarEntryId = addEntry({ date, eventName: name, timeSlot: timeSlot || "未設定", colorId: "7" });
    const s = createSession({ name, date, calendarEntryId });
    setSelectedId(s.id);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">割り勘</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">支払いを記録して精算金額を計算します</p>
      </div>

      {selected ? (
        <SessionDetail
          session={selected}
          onUpdate={updateSession}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <SessionList
          sessions={sessions}
          eventNames={eventNames}
          timeSlots={timeSlots}
          onSelect={(s) => setSelectedId(s.id)}
          onCreate={handleCreate}
          onDelete={deleteSession}
        />
      )}
    </div>
  );
}
