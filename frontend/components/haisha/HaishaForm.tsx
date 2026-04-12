"use client";
import { useState, useRef } from "react";

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

type Errors = Record<string, string>;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function createMember(isDriver: boolean): Member {
  return { id: crypto.randomUUID(), name: "", station: "", can_drive: isDriver, capacity: 4, want_with: "", awkward_with: "" };
}

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
      want_with: row["一緒になりたい人"] || row["want_with"] || "",
      awkward_with: row["気まずい人"] || row["awkward_with"] || "",
    };
  }).filter((r) => r.name !== "");
}

export default function HaishaForm() {
  const [members, setMembers] = useState<Member[]>([createMember(true), createMember(false), createMember(false)]);
  const [targetArrival, setTargetArrival] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvApplied, setCsvApplied] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addMember = (isDriver: boolean) => setMembers((prev) => [...prev, createMember(isDriver)]);
  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setErrors((prev) => { const next = { ...prev }; delete next[`${id}-name`]; delete next[`${id}-station`]; return next; });
  };
  const updateMember = (id: string, field: keyof Member, value: string | boolean | number) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
    setErrors((prev) => ({ ...prev, [`${id}-${field}`]: "" }));
  };

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
    const newMembers: Member[] = csvRows.map((row) => ({
      id: crypto.randomUUID(),
      name: row.name,
      station: row.station,
      can_drive: row.role === "運転手" || row.role === "driver",
      capacity: parseInt(row.capacity) || 4,
      want_with: row.want_with,
      awkward_with: row.awkward_with,
    }));
    setMembers(newMembers);
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
      <div>
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">配車最適化</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">移動時間・人間関係を考慮した最適配車を計算します</p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="メンバー" value={members.length} color="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" />
        <StatCard label="運転手" value={drivers.length} color="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300" />
        <StatCard label="空席数" value={Math.max(0, totalSeats - passengers.length)} color="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300" />
      </div>

      {/* CSVアップロード */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">📄 Google FormのCSVから読み込む</h2>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
        >
          <p className="text-2xl mb-2">📂</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {csvFileName ? csvFileName : "CSVファイルをクリックして選択"}
          </p>
          <p className="text-xs text-gray-400 mt-1">Google スプレッドシート → ファイル → ダウンロード → CSV</p>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
        </div>

        {csvRows.length > 0 && (
          <div className="mt-4 animate-slide-up">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{csvRows.length}件のデータを読み込みました</p>
              {csvApplied && <span className="text-xs text-green-600 dark:text-green-400">✅ 反映済み</span>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    {["名前", "最寄り駅", "参加形態", "定員", "一緒になりたい人", "気まずい人"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.map((row, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.station}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                          row.role === "運転手" || row.role === "driver"
                            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                            : "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                        }`}>
                          {row.role === "運転手" || row.role === "driver" ? "🚗 運転手" : "👤 乗客"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.role === "運転手" ? row.capacity : "-"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.want_with || "-"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.awkward_with || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={applyCsv}
              className="mt-3 w-full py-2.5 rounded-xl text-sm font-medium bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white transition-all duration-150">
              ✅ このデータでメンバーを設定する
            </button>
          </div>
        )}

        <details className="mt-3">
          <summary className="text-xs text-gray-400 cursor-pointer">CSVのフォーマットを確認する</summary>
          <div className="mt-2 bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-xs text-gray-500 dark:text-gray-400 font-mono">
            名前,最寄り駅,参加形態,定員,一緒になりたい人,気まずい人<br/>
            田中,新宿,運転手,4,山田,<br/>
            山田,渋谷,乗客,,,<br/>
            鈴木,池袋,乗客,,田中,
          </div>
        </details>
      </div>

      {/* オプション設定（到着時刻） */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
        <button onClick={() => setShowOptions(!showOptions)}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 w-full text-left transition-colors">
          <span>⏰</span><span>到着希望時刻（任意）</span>
          <span className="ml-auto transition-transform duration-200" style={{ transform: showOptions ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
        </button>
        {showOptions && (
          <div className="mt-3 animate-slide-up">
            <label className="text-xs text-gray-400 mb-1 block">到着希望時刻</label>
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

      {/* メンバー入力 */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 transition-colors">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">メンバー</h2>
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
        <div className="space-y-3">
          {members.map((m) => (
            <div key={m.id}
              className={`border rounded-xl p-3 transition-all duration-200 animate-slide-up ${
                m.can_drive ? "border-l-4 border-l-blue-400 border-gray-100 dark:border-gray-700" : "border-l-4 border-l-green-400 border-gray-100 dark:border-gray-700"
              }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                  m.can_drive ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                }`}>{m.can_drive ? "🚗 運転手" : "👤 乗客"}</span>
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
          ))}
        </div>
      </div>

      {/* 計算ボタン */}
      <button onClick={calculate} disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-blue-300 text-white font-medium py-3 rounded-xl text-sm transition-all duration-150">
        {loading ? "計算中..." : "🔍 最適配車を計算する"}
      </button>

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
                  <div key={car.car_id} className="border-l-4 border-l-blue-400 border border-gray-100 dark:border-gray-700 rounded-xl p-3 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">🚗 車 {car.car_id}</p>
                      <span className="text-xs text-gray-400">{car.members.length}名</span>
                    </div>
                    <ul className="space-y-1.5">
                      {car.members.map((member, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${i === 0 ? "bg-blue-400" : "bg-green-400"}`} />
                          {member}
                          {i === 0 && <span className="text-xs text-blue-500 dark:text-blue-400 ml-auto">運転手</span>}
                        </li>
                      ))}
                    </ul>
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
