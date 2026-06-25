import { useState } from "react";
import { getTheme, toggleTheme } from "../theme.js";
import { SunIcon, MoonIcon } from "../icons.jsx";

// Small sun/moon switch. Local state mirrors the persisted theme.
export default function ThemeToggle({ className = "" }) {
  const [theme, setThemeState] = useState(getTheme());
  const dark = theme === "dark";
  return (
    <button
      onClick={() => setThemeState(toggleTheme())}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle dark mode"
      className={`inline-flex items-center justify-center rounded-lg p-2 transition-colors
                  hover:bg-slate-200/60 dark:hover:bg-slate-700/60 ${className}`}
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
