"use client";
import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";

type Member = {
  id: string;
  name: string;
  station: string;
  can_drive: boolean;
  capacity: number;
  want_with: string;
  awkward_with: string;
};

type Assignment = {
  car_id: number;
  driver: string;
  members: string[];
};

type Result = {
  assignments: Assignment[];
  unassigned: string[];
  method: string;
  objective?: number;
  feasible?: boolean;
  error?: string;
};

type CsvRow = {
  name: string;
  station: string;
  role: string;
  capacity: string;
  want_with: string;
  awkward_with: string;
};

type FormResult = {
  form_id?: string;
  form_url?: string;
  edit_url?: string;
  sheet_url?: string;
  error?: string;
};

type Errors = Record<string, string>;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STORAGE_KEY = "haisha_members";
const ARRIVAL_KEY = "haisha_arrival";

function createMember(isDriver: boolean): Member {
  return { id: crypto.randomUUID(), name: "", station: "", can_drive: isDriver, capacity: 4, want_with: "", awkward_with: "" };
}

const defaultMembers = [createMember(true), createMember(false), createMember(false)];

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 animate-pulse-soft">
      <div className="flex justify-between mb-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12" />
      </div>
      {[1,2,3].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
          <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
          <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center justify-center flex-shrink-0">
      {n}
    </span>
  );
}

type MemberCardProps = {
  m: Member;
  errors: Errors;
  inputClass: (key: string) => string;
  updateMember: (id: string, field: keyof Member, value: string | boolean | number) => void;
  removeMember: (id: string) => void;
};

function MemberCard({ m, errors, inputClass, updateMember, removeMember }: MemberCardProps) {
  return (
    <div className={`border rounded-xl p-3 transition-all duration-200 animate-slide-up ${
      m.can_drive ? "border-l-4 border-l-blue-400 border-gray-100 dark:border-gray-700" : "border-l-4 border-l-green-400 border-gray-100 dark:border-gray-700"
    }`}>
      <div className="flex items-center justify-end mb-2">
        <button onClick={() => removeMember(m.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors">✕</button>
      </div>
      <div className={`grid gap-2 mb-2 ${m.can_drive ? "grid-cols-3" : "grid-cols-2"}`}>
        <div>
          <label className="text-xs text-gray-400 block mb-1">名前 *</label>
          <input type="text" value={m.name} onChange={(e) => updateMember(m.id, "name", e.target.value)} placeholder="田中" className={inputClass(`${m.id}-name`)} />
          {errors[`${m.id}-name`] && <p className="text-xs text-red-500 mt-0.5">{errors[`${m.id}-name`]}</p>}
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">最寄り駅 *</label>
          <input type="text" value={m.station} onChange={(e) => updateMember(m.id, "station", e.target.value)} placeholder="新宿" className={inputClass(`${m.id}-station`)} />
          {errors[`${m.id}-station`] && <p className="text-xs text-red-500 mt-0.5">{errors[`${m.id}-station`]}</p>}
        </div>
        {m.can_drive && (
          <div>
            <label className="text-xs text-gray-400 block mb-1">定員</label>
            <input type="number" value={m.capacity} min={2} onChange={(e) => updateMember(m.id, "capacity", parseInt(e.target.value))} className={inputClass(`${m.id}-capacity`)} />
            {errors[`${m.id}-capacity`] && <p className="text-xs text-red-500 mt-0.5">{errors[`${m.id}-capacity`]}</p>}
          </div>
        )}
      </div>
      <details className="mt-1">
        <summary className="text-xs text-gray-400 cursor-pointer select-none">人間関係（任意）</summary>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {[
            { label: "一緒になりたい人", field: "want_with" as keyof Member, placeholder: "山田, 鈴木" },
            { label: "気まずい人", field: "awkward_with" as keyof Member, placeholder: "佐藤" },
          ].map(({ label, field, placeholder }) => (
            <div key={field as string}>
              <label className="text-xs text-gray-400 block mb-1">{label}</label>
              <input type="text" value={m[field] as string} onChange={(e) => updateMember(m.id, field, e.target.value)} placeholder={placeholder}
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors" />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return {
      name: row["名前"] || row["name"] || "",
      station: row["最寄り駅"] || row["station"] || "",
      role: row["参加形態"] || row["role"] || "乗客",
      capacity: row["定員"] || row["capacity"] || "4",
      want_with: row["一緒になりたい人（カンマ区切り）"] || row["一緒になりたい人"] || row["want_with"] || "",
      awkward_with: row["気まずい人（カンマ区切り）"] || row["気まずい人"] || row["awkward_with"] || "",
    };
  }).filter((r) => r.name !== "");
}

export default function HaishaForm() {
  const { data: session } = useSession();
  const [members, setMembers] = useState<Member[]>(defaultMembers);
  const [targetArrival, setTargetArrival] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvApplied, setCsvApplied] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Google Form関連
  const [eventName, setEventName] = useState("イベント参加フォーム");
  const [formResult, setFormResult] = useState<FormResult | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetApplied, setSheetApplied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const savedMembers = localStorage.getItem(STORAGE_KEY);
      const savedArrival = localStorage.getItem(ARRIVAL_KEY);
      if (savedMembers) setMembers(JSON.parse(savedMembers));
      if (savedArrival) setTargetArrival(savedArrival);
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(members)); } catch {}
  }, [members]);

  useEffect(() => {
    try { localStorage.setItem(ARRIVAL_KEY, targetArrival); } catch {}
  }, [targetArrival]);

  const addMember = (isDriver: boolean) => setMembers((prev) => [createMember(isDriver), ...prev]);
  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setErrors((prev) => { const next = { ...prev }; delete next[`${id}-name`]; delete next[`${id}-station`]; return next; });
  };
  const updateMember = (id: string, field: keyof Member, value: string | boolean | number) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
    setErrors((prev) => ({ ...prev, [`${id}-${field}`]: "" }));
  };

  const resetAll = () => {
    setMembers([createMember(true), createMember(false), createMember(false)]);
    setTargetArrival("");
    setResult(null);
    setErrors({});
    setCsvRows([]);
    setCsvFileName("");
    setCsvApplied(false);
    setFormResult(null);
    setSheetApplied(false);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ARRIVAL_KEY);
  };

  // Google Form作成
  const createForm = async () => {
    if (!session?.access_token) return;
    setLoadingForm(true);
    setFormResult(null);
    try {
      const res = await fetch(`${API_BASE}/create-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: session.access_token, event_name: eventName }),
      });
      setFormResult(await res.json());
    } catch {
      setFormResult({ error: "フォーム作成に失敗しました。" });
    } finally {
      setLoadingForm(false);
    }
  };

  // スプレッドシートから回答取得
  const getResponses = async () => {
    if (!session?.access_token || !spreadsheetId) return;
    setLoadingSheet(true);
    setSheetApplied(false);
    try {
      const res = await fetch(`${API_BASE}/get-responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: session.access_token, spreadsheet_id: spreadsheetId }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        const newMembers = data.members.map((m: any) => ({
          id: crypto.randomUUID(),
          name: m.name,
          station: m.station,
          can_drive: m.can_drive,
          capacity: m.capacity,
          want_with: m.want_with.join(", "),
          awkward_with: m.awkward_with.join(", "),
        }));
        setMembers(newMembers);
        setSheetApplied(true);
      }
    } catch {
      alert("回答の取得に失敗しました。");
    } finally {
      setLoadingSheet(false);
    }
  };

  // CSV読み込み
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvApplied(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvRows(parseCsv(text));
    };
    reader.readAsText(file, "UTF-8");
  };

  const applyCsv = () => {
    setMembers(csvRows.map((row) => ({
      id: crypto.randomUUID(),
      name: row.name,
      station: row.station,
      can_drive: row.role === "運転手" || row.role === "driver",
      capacity: parseInt(row.capacity) || 4,
      want_with: row.want_with,
      awkward_with: row.awkward_with,
    })));
    setCsvApplied(true);
    setResult(null);
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: Errors = {};
    members.forEach((m) => {
      if (!m.name.trim()) newErrors[`${m.id}-name`] = "名前を入力してください";
      if (!m.station.trim()) newErrors[`${m.id}-station`] = "駅名を入力してください";
      if (m.can_drive && m.capacity < 2) newErrors[`${m.id}-capacity`] = "定員は2以上";
    });
    const drivers = members.filter((m) => m.can_drive);
    const passengers = members.filter((m) => !m.can_drive);
    if (drivers.length === 0) newErrors["global"] = "運転手を1人以上追加してください";
    else if (passengers.length === 0) newErrors["global"] = "乗客を1人以上追加してください";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculate = async () => {
    if (!validate()) return;
    const payload = {
      members: members.map((m) => ({
        name: m.name, station: m.station, can_drive: m.can_drive,
        capacity: m.can_drive ? m.capacity : null,
        want_with: m.want_with ? m.want_with.split(",").map((s) => s.trim()).filter(Boolean) : [],
        awkward_with: m.awkward_with ? m.awkward_with.split(",").map((s) => s.trim()).filter(Boolean) : [],
      })),
      target_arrival: targetArrival,
      p_score: -5,
    };
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setResult(await res.json());
    } catch {
      setResult({ assignments: [], unassigned: [], method: "", error: "通信エラーが発生しました。バックエンドが起動しているか確認してください。" });
    } finally {
      setLoading(false);
    }
  };

  const drivers = members.filter((m) => m.can_drive);
  const passengers = members.filter((m) => !m.can_drive);
  const totalSeats = drivers.reduce((acc, d) => acc + (d.capacity - 1), 0);
  const inputClass = (errKey: string) =>
    `w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors dark:bg-gray-700 dark:text-gray-100 ${
      errors[errKey] ? "border-red-300 focus:ring-red-100 dark:border-red-500" : "border-gray-200 dark:border-gray-600 focus:ring-blue-100"
    }`;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">配車</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">移動時間・人間関係を考慮した最適配車を計算します</p>
        </div>
        <button onClick={resetAll}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors">
          🗑 リセット
        </button>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">💾 入力内容は自動保存されます</p>

      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="メンバー" value={members.length} color="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" />
        <StatCard label="運転手" value={drivers.length} color="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300" />
        <StatCard label="空席数" value={Math.max(0, totalSeats - passengers.length)} color="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300" />
      </div>

      {/* STEP 1: Google Form自動作成 */}
      {session && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
          <div className="flex items-center gap-2 mb-4">
            <StepBadge n={1} />
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">Google Formを自動作成する</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">イベント名</label>
              <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)}
                placeholder="例：4月サークル合宿"
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors" />
            </div>
            <button onClick={createForm} disabled={loadingForm}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-blue-300 text-white font-medium py-2.5 rounded-xl text-sm transition-all duration-150">
              {loadingForm ? "作成中..." : "📋 フォームを自動作成する"}
            </button>
          </div>

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
                  </div>
                  <button onClick={() => setSpreadsheetId(formResult.form_id || "")}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors">
                    STEP2に自動入力する
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: 回答を取得 */}
      {session && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
          <div className="flex items-center gap-2 mb-4">
            <StepBadge n={2} />
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">回答を取得してメンバーに反映する</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">スプレッドシートID</label>
              <input type="text" value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="スプレッドシートURLの /d/【ここ】/edit"
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors" />
            </div>
            <button onClick={getResponses} disabled={loadingSheet || !spreadsheetId}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-blue-300 text-white font-medium py-2.5 rounded-xl text-sm transition-all duration-150">
              {loadingSheet ? "取得中..." : "📥 回答を取得してメンバーに反映する"}
            </button>
            {sheetApplied && (
              <p className="text-xs text-green-600 dark:text-green-400 text-center">✅ メンバーに反映しました！下のSTEP4で配車計算できます</p>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: CSVアップロード（Googleログインしていない場合の代替） */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <StepBadge n={session ? 3 : 1} />
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {session ? "または CSVから読み込む" : "CSVから読み込む"}
            </h2>
          </div>
          <button
            onClick={() => {
              const csv = [
                "名前,最寄り駅,参加形態,定員,一緒になりたい人,気まずい人",
                "田中,新宿,運転手,4,山田,",
                "山田,渋谷,乗客,,,",
                "鈴木,池袋,乗客,,田中,",
              ].join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "haisha_template.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          >
            📥 テンプレートDL
          </button>
        </div>
        <div onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl p-5 text-center cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors">
          <p className="text-xl mb-1">📂</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{csvFileName ? csvFileName : "CSVファイルをクリックして選択"}</p>
          <p className="text-xs text-gray-400 mt-1">Google スプレッドシート → ファイル → ダウンロード → CSV</p>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
        </div>
        {csvRows.length > 0 && (
          <div className="mt-3 animate-slide-up">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-600 dark:text-gray-400">{csvRows.length}件を読み込みました</p>
              {csvApplied && <span className="text-xs text-green-600 dark:text-green-400">✅ 反映済み</span>}
            </div>
            <button onClick={applyCsv}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white transition-all duration-150">
              ✅ このデータでメンバーを設定する
            </button>
          </div>
        )}
      </div>

      {/* オプション設定 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
        <button onClick={() => setShowOptions(!showOptions)}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-full text-left transition-colors">
          <span>⏰</span><span>到着希望時刻（任意）</span>
          <span className="ml-auto transition-transform duration-200" style={{ transform: showOptions ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
        </button>
        {showOptions && (
          <div className="mt-3 animate-slide-up">
            <input type="datetime-local" value={targetArrival} onChange={(e) => setTargetArrival(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors" />
          </div>
        )}
      </div>

      {/* グローバルエラー */}
      {errors["global"] && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400 animate-slide-up">
          ⚠️ {errors["global"]}
        </div>
      )}

      {/* STEP 4: メンバー入力 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <StepBadge n={session ? 4 : 2} />
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">メンバーを確認・編集する</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={() => addMember(false)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              + 乗客
            </button>
            <button onClick={() => addMember(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
              + 運転手
            </button>
          </div>
        </div>
        <div className="space-y-4">
          {/* 運転手セクション */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">🚗 運転手</span>
              <span className="text-xs text-gray-400">({drivers.length}名)</span>
            </div>
            <div className="space-y-3">
              {drivers.map((m) => (
                <MemberCard key={m.id} m={m} errors={errors} inputClass={inputClass} updateMember={updateMember} removeMember={removeMember} />
              ))}
              {drivers.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">運転手を追加してください</p>
              )}
            </div>
          </div>
          {/* 乗客セクション */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-green-600 dark:text-green-400">👤 乗客</span>
              <span className="text-xs text-gray-400">({passengers.length}名)</span>
            </div>
            <div className="space-y-3">
              {passengers.map((m) => (
                <MemberCard key={m.id} m={m} errors={errors} inputClass={inputClass} updateMember={updateMember} removeMember={removeMember} />
              ))}
              {passengers.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">乗客を追加してください</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* STEP 5: 計算ボタン */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
        <div className="flex items-center gap-2 mb-4">
          <StepBadge n={session ? 5 : 3} />
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">配車を計算する</h2>
        </div>
        <button onClick={calculate} disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-blue-300 text-white font-medium py-3 rounded-xl text-sm transition-all duration-150">
          {loading ? "計算中..." : "🔍 最適配車を計算する"}
        </button>
      </div>

      {loading && <div className="space-y-3 animate-fade-in"><SkeletonCard /><SkeletonCard /></div>}

      {!loading && result && (
        <div className="space-y-3 animate-slide-up">
          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">配車結果</h2>
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-1 rounded-md">
                {result.method === "amplify" ? "🔬 Amplify最適化" : "📐 グリーディ法"}
              </span>
            </div>
            {result.error ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">⚠️ {result.error}</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="配車台数" value={result.assignments.length} color="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" />
                  <StatCard label="未配車" value={result.unassigned?.length ?? 0}
                    color={result.unassigned?.length ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300" : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"} />
                </div>
                {result.assignments.map((car) => (
                  <div key={car.car_id} className="border border-gray-100 dark:border-gray-700 rounded-xl p-3 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center flex-shrink-0">{car.car_id}</span>
                        <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{car.members[0]}</p>
                        <span className="text-xs text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-md">運転手</span>
                      </div>
                      <span className="text-xs text-gray-400">{car.members.length}名</span>
                    </div>
                    {car.members.length > 1 && (
                      <ul className="space-y-1 pl-8">
                        {car.members.slice(1).map((member, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
                            {member}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {result.unassigned && result.unassigned.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-3 text-sm text-red-500 dark:text-red-400">
                    ⚠️ 乗れなかった人: {result.unassigned.join("、")}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
