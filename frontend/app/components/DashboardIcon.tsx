"use client";

export function DashboardIcon({ name }: { name: string }) {
  const c = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "home") return <svg {...c}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
  if (name === "grid") return <svg {...c}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  if (name === "chart") return <svg {...c}><path d="M4 20V10M10 20V4M16 20v-6M22 20H2" /></svg>;
  if (name === "pie") return <svg {...c}><path d="M21 12A9 9 0 1 1 12 3" /><path d="M21 12A9 9 0 0 0 12 3v9h9z" /></svg>;
  if (name === "list") return <svg {...c}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></svg>;
  if (name === "line") return <svg {...c}><path d="M3 17l6-6 4 4 8-8" /></svg>;
  if (name === "gear") return <svg {...c}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-1.4 3.4h-.1a1.7 1.7 0 0 0-1.6 1.2 1.7 1.7 0 0 1-1.7 1.3h-.4a1.7 1.7 0 0 1-1.7-1.3 1.7 1.7 0 0 0-1.6-1.2h-.1a1.7 1.7 0 0 0-1.4.7" /></svg>;
  if (name === "help") return <svg {...c}><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 1 1 6 0c0 2-3 2.5-3 4.5" /><path d="M12 17h.01" /></svg>;
  if (name === "down") return <svg {...c}><path d="M12 5v14M6 13l6 6 6-6" /></svg>;
  if (name === "up") return <svg {...c}><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
  if (name === "wallet") return <svg {...c}><path d="M3.5 6.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" /><path d="M17 12h3.5v4H17a2 2 0 1 1 0-4Z" /></svg>;
  if (name === "copy") return <svg {...c}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
  if (name === "check") return <svg {...c}><path d="m5 13 4 4L19 7" /></svg>;
  return null;
}