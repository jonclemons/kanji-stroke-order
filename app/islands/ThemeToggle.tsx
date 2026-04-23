import { useEffect, useState } from "hono/jsx";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "kanji-theme-mode";

function resolveInitialTheme(): ThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

function readActiveTheme(): ThemeMode {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof document === "undefined") return "light";
    return readActiveTheme();
  });

  useEffect(() => {
    const initialTheme = resolveInitialTheme();
    applyTheme(initialTheme);
    setTheme(initialTheme);

    const syncWithDocumentTheme = () => {
      setTheme(readActiveTheme());
    };

    window.addEventListener("pageshow", syncWithDocumentTheme);
    window.addEventListener("storage", syncWithDocumentTheme);

    return () => {
      window.removeEventListener("pageshow", syncWithDocumentTheme);
      window.removeEventListener("storage", syncWithDocumentTheme);
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  return (
    <button
      class="theme-toggle-btn"
      type="button"
      aria-label="テーマをきりかえ"
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}
    >
      {theme === "dark" ? "テーマ: よる" : "テーマ: おちつく"}
    </button>
  );
}
