// Dark-mode helper. Uses Tailwind's class strategy: toggling `dark` on <html>.
// The choice is persisted in localStorage and falls back to the OS preference.
const KEY = "cs-theme";

export function getTheme() {
  const saved = localStorage.getItem(KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme) {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

// Apply the saved/OS theme immediately on import, before React renders, so there
// is no light-mode flash.
applyTheme(getTheme());
