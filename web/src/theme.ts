export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "roster-theme";

/** Reads the persisted theme choice. Falls back to "system" if unset, invalid, or storage throws
 * (e.g. private-mode WebKit). */
export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** Sets `data-theme` on the document root: "system" removes the attribute (CSS falls back to
 * `prefers-color-scheme`); "light"/"dark" force an explicit override. */
export function applyTheme(theme: Theme): void {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

/** Persists the theme choice and applies it immediately. Storage errors are swallowed - the
 * theme still applies for this session, it just won't persist across reloads. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  applyTheme(theme);
}
