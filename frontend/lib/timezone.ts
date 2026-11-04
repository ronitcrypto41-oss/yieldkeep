// frontend/lib/timezone.ts
// Time zones for every country. The app shows times in the user's own zone:
// "auto" = the zone of the device (Russia sees Russian time, USA sees US time, India sees IST ...),
// or the user picks any zone from the world list. The choice is remembered in this browser.

import { useEffect, useState } from "react";

const KEY = "yk_tz_v1";

export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** All world time zones (IANA names like "Europe/Moscow", "America/New_York"). */
export function allZones(): string[] {
  try {
    const f = (Intl as any).supportedValuesOf;
    if (typeof f === "function") {
      const list: string[] = f.call(Intl, "timeZone");
      if (list.length) return list.includes("UTC") ? list : ["UTC", ...list];
    }
  } catch {}
  // very old browsers: a short fallback list
  return [
    "UTC", "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Chicago",
    "America/New_York", "America/Sao_Paulo", "Atlantic/Reykjavik", "Europe/London", "Europe/Paris", "Europe/Berlin",
    "Europe/Istanbul", "Europe/Moscow", "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg", "Asia/Dubai",
    "Asia/Karachi", "Asia/Calcutta", "Asia/Dhaka", "Asia/Bangkok", "Asia/Singapore", "Asia/Shanghai", "Asia/Tokyo",
    "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
  ];
}

export function readZonePref(): string {
  try {
    return window.localStorage.getItem(KEY) || "auto";
  } catch {
    return "auto";
  }
}
export function saveZonePref(pref: string) {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {}
  window.dispatchEvent(new Event("yk-tz"));
}
export function resolveZone(pref: string): string {
  const z = pref === "auto" ? deviceZone() : pref;
  try {
    new Intl.DateTimeFormat("en", { timeZone: z });
    return z;
  } catch {
    return "UTC";
  }
}

/** React hook: { pref, zone, setPref }. Every component using it updates together. */
export function useZone() {
  const [pref, setPrefState] = useState("auto");
  useEffect(() => {
    const load = () => setPrefState(readZonePref());
    load();
    window.addEventListener("yk-tz", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("yk-tz", load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return { pref, zone: resolveZone(pref), setPref: saveZonePref };
}

/** Year / month (0-11) / day / hour / minute of a moment, as seen in a zone. */
export function partsIn(ms: number, zone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23",
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ms))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { y: p.year, m: p.month - 1, d: p.day, hh: p.hour, mm: p.minute };
}

/** "GMT+5:30", "GMT-5", "GMT+3" ... */
export function offsetLabel(ms: number, zone: string): string {
  try {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" });
    return f.formatToParts(new Date(ms)).find((x) => x.type === "timeZoneName")?.value ?? "UTC";
  } catch {
    return "UTC";
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-02 22:13" in the zone (for tables and files). */
export function fmtShort(ms: number, zone: string): string {
  if (!ms) return "date pending";
  const p = partsIn(ms, zone);
  return `${p.y}-${pad(p.m + 1)}-${pad(p.d)} ${pad(p.hh)}:${pad(p.mm)}`;
}
/** "2026-11-02 22:13 GMT+5:30 (Asia/Calcutta)" */
export function fmtStamp(ms: number, zone: string): string {
  if (!ms) return "date pending";
  return `${fmtShort(ms, zone)} ${offsetLabel(ms, zone)} (${zone})`;
}
/** "2 Nov 2026, 22:13" for the screen */
export function fmtScreen(ms: number, zone: string): string {
  if (!ms) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(ms));
}
export function fmtTimeOnly(ms: number, zone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}