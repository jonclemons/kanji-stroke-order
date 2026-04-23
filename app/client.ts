import { createClient } from "honox/client";
import { APP_VERSION } from "../src/version.js";

createClient();

type ThemeMode = "light" | "dark";
const THEME_STORAGE_KEY = "kokugo-theme";

function preferredTheme(): ThemeMode {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") {
    return saved;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", theme);

  const toggleButton = document.getElementById("themeToggle");
  if (toggleButton) {
    toggleButton.textContent = theme === "dark" ? "あかるいがめん" : "くらいがめん";
    toggleButton.setAttribute("aria-pressed", String(theme === "dark"));
  }
}

function setupThemeToggle() {
  const toggleButton = document.getElementById("themeToggle");
  if (!toggleButton) return;

  let currentTheme = preferredTheme();
  applyTheme(currentTheme);

  toggleButton.addEventListener("click", () => {
    currentTheme = currentTheme === "light" ? "dark" : "light";
    window.localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
    applyTheme(currentTheme);
  });
}

setupThemeToggle();

async function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  if (isLocalhost) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    }

    return;
  }

  const hadController = Boolean(navigator.serviceWorker.controller);
  let hasReloadedForServiceWorkerUpdate = false;

  if (hadController) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hasReloadedForServiceWorkerUpdate) return;
      hasReloadedForServiceWorkerUpdate = true;
      window.location.reload();
    });
  }

  const registration = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`, {
    updateViaCache: "none",
  });
  await registration.update();
}

void setupServiceWorker();
