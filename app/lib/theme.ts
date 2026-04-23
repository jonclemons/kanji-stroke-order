export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "auto";

export const THEME_STORAGE_KEY = "kokugo-theme";
export const LIGHT_THEME_COLOR = "#d4e4ed";
export const DARK_THEME_COLOR = "#1c242d";

export function normalizeThemePreference(value: string | null | undefined): ThemePreference {
  if (value === "light" || value === "dark" || value === "auto") {
    return value;
  }

  return "auto";
}

export function detectSystemTheme(matchMediaImpl?: typeof window.matchMedia): ThemeMode | null {
  if (!matchMediaImpl) return null;

  try {
    if (matchMediaImpl("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }

    if (matchMediaImpl("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveTimeOfDayTheme(now: Date = new Date()): ThemeMode {
  const hour = now.getHours();
  return hour >= 18 || hour < 6 ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference, matchMediaImpl?: typeof window.matchMedia, now?: Date): ThemeMode {
  if (preference === "light" || preference === "dark") {
    return preference;
  }

  return detectSystemTheme(matchMediaImpl) ?? resolveTimeOfDayTheme(now);
}

export function themeColorFor(theme: ThemeMode): string {
  return theme === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
}

export function readStoredThemePreference(storage?: Storage): ThemePreference {
  if (!storage) return "auto";

  try {
    return normalizeThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

export function writeStoredThemePreference(preference: ThemePreference, storage?: Storage): void {
  if (!storage) return;

  try {
    if (preference === "auto") {
      storage.removeItem(THEME_STORAGE_KEY);
      return;
    }

    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore storage failures and continue with in-memory theme state.
  }
}

export function applyTheme(theme: ThemeMode, preference: ThemePreference = "auto"): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-theme-preference", preference);
  root.style.colorScheme = theme;

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", themeColorFor(theme));
  }
}

const INIT_SCRIPT = [
  "(() => {",
  `  const STORAGE_KEY = ${JSON.stringify(THEME_STORAGE_KEY)};`,
  `  const LIGHT = ${JSON.stringify(LIGHT_THEME_COLOR)};`,
  `  const DARK = ${JSON.stringify(DARK_THEME_COLOR)};`,
  "  const normalize = (value) => (value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto');",
  "  const detectSystemTheme = () => {",
  "    if (!window.matchMedia) return null;",
  "    try {",
  "      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';",
  "      if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';",
  "    } catch {",
  "      return null;",
  "    }",
  "    return null;",
  "  };",
  "  const resolveTimeOfDayTheme = () => {",
  "    const hour = new Date().getHours();",
  "    return hour >= 18 || hour < 6 ? 'dark' : 'light';",
  "  };",
  "  let preference = 'auto';",
  "  try {",
  "    preference = normalize(window.localStorage.getItem(STORAGE_KEY));",
  "  } catch {}",
  "  const theme = preference === 'auto' ? (detectSystemTheme() || resolveTimeOfDayTheme()) : preference;",
  "  const root = document.documentElement;",
  "  root.setAttribute('data-theme', theme);",
  "  root.setAttribute('data-theme-preference', preference);",
  "  root.style.colorScheme = theme;",
  "  const themeColorMeta = document.querySelector('meta[name=\"theme-color\"]');",
  "  if (themeColorMeta) {",
  "    themeColorMeta.setAttribute('content', theme === 'dark' ? DARK : LIGHT);",
  "  }",
  "})();",
].join("\n");

export const THEME_INIT_SCRIPT = INIT_SCRIPT;
