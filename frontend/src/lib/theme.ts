export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

const isTheme = (value: string | null): value is Theme =>
  value === "light" || value === "dark";

export const getStoredTheme = (): Theme | null => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
};

export const getSystemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/** The theme to show right now: an explicit choice if one was ever made, else the OS setting. */
export const resolveTheme = (): Theme => getStoredTheme() ?? getSystemTheme();

export const setDocumentTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme;
};

/** Applies a theme the user explicitly chose, so it sticks on the next visit. */
export const persistTheme = (theme: Theme): void => {
  setDocumentTheme(theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable, e.g. private browsing; the theme still applies visually.
  }
};
