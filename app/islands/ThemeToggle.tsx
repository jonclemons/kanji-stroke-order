import { useEffect, useMemo, useState } from "hono/jsx";
import {
  applyTheme,
  readStoredThemePreference,
  resolveTheme,
  type ThemeMode,
  type ThemePreference,
  writeStoredThemePreference,
} from "../lib/theme";

export default function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("auto");
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const matchMediaImpl = typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined;
    const nextPreference = readStoredThemePreference(window.localStorage);
    const nextTheme = resolveTheme(nextPreference, matchMediaImpl);
    setPreference(nextPreference);
    setTheme(nextTheme);
    applyTheme(nextTheme, nextPreference);

    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      if (readStoredThemePreference(window.localStorage) !== "auto") return;
      const autoTheme = resolveTheme("auto", matchMediaImpl);
      setPreference("auto");
      setTheme(autoTheme);
      applyTheme(autoTheme, "auto");
    };

    const timeCheckInterval = window.setInterval(() => {
      if (readStoredThemePreference(window.localStorage) !== "auto") return;
      const autoTheme = resolveTheme("auto", matchMediaImpl);
      setPreference("auto");
      setTheme(autoTheme);
      applyTheme(autoTheme, "auto");
    }, 60_000);

    mediaQuery?.addEventListener?.("change", onSystemThemeChange);

    return () => {
      window.clearInterval(timeCheckInterval);
      mediaQuery?.removeEventListener?.("change", onSystemThemeChange);
    };
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";
  const buttonLabel = useMemo(() => {
    if (preference === "auto") {
      return theme === "dark"
        ? "くらいがめんです。おすと あかるくします"
        : "あかるいがめんです。おすと くらくします";
    }

    return theme === "dark" ? "あかるいがめんにする" : "くらいがめんにする";
  }, [preference, theme]);

  return (
    <button
      aria-label={buttonLabel}
      aria-pressed={theme === "dark"}
      class={`theme-toggle-btn is-${theme}${preference === "auto" ? " is-auto" : ""}`}
      title={buttonLabel}
      type="button"
      onClick={() => {
        const explicitPreference: ThemePreference = nextTheme;
        writeStoredThemePreference(explicitPreference, window.localStorage);
        setPreference(explicitPreference);
        setTheme(explicitPreference);
        applyTheme(explicitPreference, explicitPreference);
      }}
    >
      <span aria-hidden="true" class="theme-toggle-track">
        <span class="theme-toggle-glyph theme-toggle-glyph-sun">
          <SunIcon />
        </span>
        <span class="theme-toggle-glyph theme-toggle-glyph-moon">
          <MoonIcon />
        </span>
        <span class="theme-toggle-thumb" />
      </span>
      <span class="sr-only">{buttonLabel}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.3" />
      <path d="M12 18.9v2.3" />
      <path d="M4.8 4.8 6.4 6.4" />
      <path d="M17.6 17.6 19.2 19.2" />
      <path d="M2.8 12h2.3" />
      <path d="M18.9 12h2.3" />
      <path d="M4.8 19.2 6.4 17.6" />
      <path d="M17.6 6.4 19.2 4.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15.6 3.6a8.8 8.8 0 1 0 4.8 15.8 9.8 9.8 0 0 1-10.8-10.8 8.9 8.9 0 0 0 6-5Z" />
    </svg>
  );
}
