"use client";

import { useState, useEffect, useCallback } from "react";

export interface Participant { id: string; name: string; }
export interface PayItem { id: string; description: string; amount: number; payerId: string; splitWith: string[]; }
export interface WarikanSession {
  id: string;
  name: string;
  date: string;
  calendarEntryId?: string; // カレンダーエントリとの紐付け
  participants: Participant[];
  items: PayItem[];
}
export interface Settlement { from: string; to: string; amount: number; }

export function uuid() { return crypto.randomUUID(); }
export function todayStr() { return new Date().toISOString().slice(0, 10); }

function useLocalStorage<T>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    try { const r = localStorage.getItem(key); if (r) setV(JSON.parse(r)); } catch {}
  }, [key]);
  const set = useCallback((fn: T | ((p: T) => T)) => {
    setV((prev) => {
      const next = typeof fn === "function" ? (fn as (p: T) => T)(prev) : fn;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);
  return [v, set] as const;
}

export function calcSettlement(session: WarikanSession): { balances: Record<string, number>; settlements: Settlement[] } {
  const balances: Record<string, number> = {};
  session.participants.forEach((p) => (balances[p.id] = 0));
  session.items.forEach((item) => {
    const targets = item.splitWith.length > 0 ? item.splitWith : session.participants.map((p) => p.id);
    const perPerson = item.amount / targets.length;
    balances[item.payerId] = (balances[item.payerId] ?? 0) + item.amount;
    targets.forEach((pid) => { balances[pid] = (balances[pid] ?? 0) - perPerson; });
  });
  const creds = Object.entries(balances).filter(([, b]) => b > 0.5).map(([id, b]) => ({ id, b })).sort((a, b) => b.b - a.b);
  const debts = Object.entries(balances).filter(([, b]) => b < -0.5).map(([id, b]) => ({ id, b: Math.abs(b) })).sort((a, b) => b.b - a.b);
  const settlements: Settlement[] = [];
  const cs = creds.map((c) => ({ ...c }));
  const ds = debts.map((d) => ({ ...d }));
  let ci = 0, di = 0;
  while (ci < cs.length && di < ds.length) {
    const amount = Math.min(cs[ci].b, ds[di].b);
    if (amount > 0.5) settlements.push({ from: ds[di].id, to: cs[ci].id, amount: Math.round(amount) });
    cs[ci].b -= amount; ds[di].b -= amount;
    if (cs[ci].b < 0.5) ci++;
    if (ds[di].b < 0.5) di++;
  }
  return { balances, settlements };
}

export function useWarikanStore() {
  const [sessions, setSessions] = useLocalStorage<WarikanSession[]>("warikan_sessions", []);
  const [selectedId, setSelectedId] = useLocalStorage<string | null>("warikan_selected_id", null);

  const createSession = (overrides?: Partial<WarikanSession>) => {
    const s: WarikanSession = {
      id: uuid(),
      name: `割り勘 ${new Date().toLocaleDateString("ja-JP")}`,
      date: todayStr(),
      participants: [],
      items: [],
      ...overrides,
    };
    setSessions((prev) => [s, ...prev]);
    return s;
  };

  const updateSession = (updated: WarikanSession) => {
    setSessions((prev) => prev.map((s) => s.id === updated.id ? updated : s));
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setSelectedId((prev) => prev === id ? null : prev);
  };

  const sessionForCalendarEntry = (calendarEntryId: string) =>
    sessions.find((s) => s.calendarEntryId === calendarEntryId) ?? null;

  return { sessions, selectedId, setSelectedId, createSession, updateSession, deleteSession, sessionForCalendarEntry };
}
