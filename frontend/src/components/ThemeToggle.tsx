"use client";

import { useEffect, useState } from "react";
import { persistTheme, resolveTheme, setDocumentTheme, type Theme } from "@/lib/theme";

export const ThemeToggle = () => {
  // "light" until the effect below runs, so server and first client render match
  // (there is no window during Next's static-export prerender to read a real
  // preference from). The page itself never shows this default: the static
  // export's inline script (see layout.tsx) sets the html element's data-theme
  // before paint. Only this button's own icon briefly reflects "light" until
  // mount, which is the standard tradeoff for avoiding a hydration mismatch.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const resolved = resolveTheme();
    setTheme(resolved);
    setDocumentTheme(resolved);
  }, []);

  const toggle = () => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      persistTheme(next);
      return next;
    });
  };

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--stroke)] bg-[var(--surface-strong)] text-[var(--navy-dark)] shadow-[var(--shadow)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
    >
      {theme === "dark" ? (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
          <path d="M8 1a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1Zm0 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-5a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1ZM2 7a1 1 0 1 1 0 2H1a1 1 0 1 1 0-2h1Zm10.24-4.24a1 1 0 0 1 1.42 1.42l-.71.7a1 1 0 1 1-1.41-1.41l.7-.71ZM4.46 11.83a1 1 0 0 1 1.41 1.41l-.7.71a1 1 0 0 1-1.42-1.42l.71-.7Zm7.78 0 .71.7a1 1 0 0 1-1.42 1.42l-.7-.71a1 1 0 0 1 1.41-1.41ZM3.76 2.76a1 1 0 0 1 1.41 1.41l-.7.71a1 1 0 1 1-1.42-1.42l.71-.7ZM8 15a1 1 0 0 1-1-1v-1a1 1 0 1 1 2 0v1a1 1 0 0 1-1 1Z" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current">
          <path d="M13.7 10.06A6 6 0 0 1 5.94 2.3a.5.5 0 0 0-.63-.63 7 7 0 1 0 9.02 9.02.5.5 0 0 0-.63-.63Z" />
        </svg>
      )}
    </button>
  );
};
