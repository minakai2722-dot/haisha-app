"use client";

import { useState, useEffect, useCallback } from "react";

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw));
    } catch {}
  }, [key]);
  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);
  return [value, set] as const;
}

export const DEFAULT_EVENT_NAMES = ["清水が丘", "日吉南", "大田区民"];
export const DEFAULT_TIME_SLOTS = [
  "18:00~21:00",
  "18:00~22:00",
  "17:00~19:00",
  "19:00~21:00",
];

// Google Calendar API の colorId は名前順ではなく固定の番号割り当て
// 1=Tomato, 2=Flamingo, 3=Tangerine, 4=Banana, 5=Sage, 6=Basil,
// 7=Peacock, 8=Blueberry, 9=Lavender, 10=Grape, 11=Graphite
export const GOOGLE_CALENDAR_COLORS: { id: string; name: string; hex: string }[] = [
  { id: "1",  name: "トマト",      hex: "#D50000" },
  { id: "2",  name: "フラミンゴ",   hex: "#E67C73" },
  { id: "3",  name: "タンジェリン", hex: "#F4511E" },
  { id: "4",  name: "バナナ",      hex: "#F6BF26" },
  { id: "5",  name: "セージ",      hex: "#33B679" },
  { id: "6",  name: "バジル",      hex: "#0B8043" },
  { id: "7",  name: "ピーコック",   hex: "#039BE5" },
  { id: "8",  name: "ブルーベリー", hex: "#3F51B5" },
  { id: "9",  name: "ラベンダー",   hex: "#7986CB" },
  { id: "10", name: "グレープ",    hex: "#8E24AA" },
  { id: "11", name: "グラファイト", hex: "#616161" },
];

export interface CalendarEntry {
  id: string;
  date: string; // YYYY-MM-DD
  eventName: string;
  timeSlot: string;
  colorId: string;
  gcalEventId?: string; // Google Calendar イベントID（削除連携用）
}

export function useCalendarStore() {
  const [eventNames, setEventNames] = useLocalStorage<string[]>(
    "calendar_event_names",
    DEFAULT_EVENT_NAMES
  );
  const [timeSlots, setTimeSlots] = useLocalStorage<string[]>(
    "calendar_time_slots",
    DEFAULT_TIME_SLOTS
  );
  const [entries, setEntries] = useLocalStorage<CalendarEntry[]>(
    "calendar_entries",
    []
  );

  const addEventName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (eventNames.includes(trimmed)) return false;
    setEventNames((prev) => [...prev, trimmed]);
    return true;
  };
  const deleteEventName = (name: string) => {
    setEventNames((prev) => prev.filter((n) => n !== name));
  };

  const addTimeSlot = (slot: string) => {
    const trimmed = slot.trim();
    if (!trimmed) return false;
    if (timeSlots.includes(trimmed)) return false;
    setTimeSlots((prev) => [...prev, trimmed]);
    return true;
  };
  const deleteTimeSlot = (slot: string) => {
    setTimeSlots((prev) => prev.filter((s) => s !== slot));
  };

  const addEntry = (entry: Omit<CalendarEntry, "id">): string => {
    const id = crypto.randomUUID();
    setEntries((prev) => [...prev, { ...entry, id }]);
    return id;
  };
  const deleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };
  const entriesForDate = (date: string) => entries.filter((e) => e.date === date);

  return {
    eventNames, addEventName, deleteEventName,
    timeSlots, addTimeSlot, deleteTimeSlot,
    entries, addEntry, deleteEntry, entriesForDate,
  };
}
