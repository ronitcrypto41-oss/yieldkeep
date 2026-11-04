"use client";

// frontend/app/components/ZonePicker.tsx
// Pick your country (every country in the world), then your exact time zone if the country has several.
// "Automatic" uses the time zone of your device. Reports use the same time zone.

import { useMemo } from "react";
import { COUNTRIES } from "@/lib/country-zones";
import { deviceZone, offsetLabel, useZone } from "@/lib/timezone";

// older names that some browsers still report -> the name used in the list
const ALIAS: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata", "Asia/Saigon": "Asia/Ho_Chi_Minh", "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon", "Asia/Dacca": "Asia/Dhaka", "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires", "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Truk": "Pacific/Chuuk", "Pacific/Ponape": "Pacific/Pohnpei", "America/Godthab": "America/Nuuk",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar", "America/Indianapolis": "America/Indiana/Indianapolis",
};
const canon = (z: string) => ALIAS[z] ?? z;
const city = (z: string) => z.split("/").slice(1).join(" / ").replace(/_/g, " ") || z;

export function ZonePicker() {
  const { pref, zone, setPref } = useZone();
  const now = Date.now();

  const byZone = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of COUNTRIES) for (const z of c.zones) m.set(z, c.code);
    return m;
  }, []);
  const byCode = useMemo(() => new Map(COUNTRIES.map((c) => [c.code, c])), []);

  const auto = pref === "auto";
  const code = byZone.get(canon(zone)) ?? "";
  const country = code ? byCode.get(code) : undefined;
  const detected = byZone.get(canon(deviceZone()));

  const onCountry = (v: string) => {
    if (v === "auto") return setPref("auto");
    if (v === "UTC") return setPref("UTC");
    const c = byCode.get(v);
    if (c) setPref(c.main ?? c.zones[0]);
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div className="act-cal-label">Country and time zone</div>
      <select
        value={auto ? "auto" : code || "UTC"}
        onChange={(e) => onCountry(e.target.value)}
        aria-label="Country"
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(148,163,184,.4)", background: "transparent", color: "inherit" }}
      >
        <option value="auto">
          Automatic (my device{detected ? `: ${byCode.get(detected)?.name}` : ""})
        </option>
        <option value="UTC">UTC (no country)</option>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>

      {!auto && country && country.zones.length > 1 && (
        <select
          value={canon(zone)}
          onChange={(e) => setPref(e.target.value)}
          aria-label="Time zone in this country"
          style={{ width: "100%", marginTop: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(148,163,184,.4)", background: "transparent", color: "inherit" }}
        >
          {country.zones.map((z) => (
            <option key={z} value={z}>
              {city(z)} ({offsetLabel(now, z)})
            </option>
          ))}
        </select>
      )}

      <p className="act-muted" style={{ marginTop: 8 }}>
        Times are shown in <b>{zone.replace(/_/g, " ")}</b> ({offsetLabel(now, zone)}). Reports and downloads use the same time zone.
      </p>
    </div>
  );
}