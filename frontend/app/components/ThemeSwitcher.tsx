"use client";

import { useEffect, useState } from "react";

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<"black" | "white">("black");

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("yk-theme") : null;
    if (saved === "white" || saved === "black") setTheme(saved);
  }, []);

  const apply = (t: "black" | "white") => {
    setTheme(t);
    const root = document.documentElement;
    root.classList.remove("theme-black", "theme-gray", "theme-white");
    root.classList.add(`theme-${t}`);
    root.style.colorScheme = t === "white" ? "light" : "dark";
    localStorage.setItem("yk-theme", t);
  };

  return (
    <div className="theme-switcher" role="group" aria-label="Theme">
      <button
        className={theme === "black" ? "active" : ""}
        onClick={() => apply("black")}
        aria-label="Dark"
      >
        <MoonIcon />
      </button>
      <button
        className={theme === "white" ? "active" : ""}
        onClick={() => apply("white")}
        aria-label="Light"
      >
        <SunIcon />
      </button>
    </div>
  );
}