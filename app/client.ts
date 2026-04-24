import { createClient } from "honox/client";
import {
  applyTheme,
  readStoredThemePreference,
  resolveTheme,
  type ThemeMode,
  type ThemePreference,
  writeStoredThemePreference,
} from "./lib/theme";
import { APP_VERSION } from "../src/version.js";

createClient();

function getThemeButtonLabel(preference: ThemePreference, theme: ThemeMode): string {
  if (preference === "auto") {
    return theme === "dark"
      ? "くらいがめんです。おすと あかるくします"
      : "あかるいがめんです。おすと くらくします";
  }

  return theme === "dark" ? "あかるいがめんにする" : "くらいがめんにする";
}

function syncThemeToggleButton(button: HTMLButtonElement, preference: ThemePreference, theme: ThemeMode) {
  const buttonLabel = getThemeButtonLabel(preference, theme);
  const srOnlyLabel = button.querySelector(".sr-only");

  button.classList.toggle("is-auto", preference === "auto");
  button.classList.toggle("is-dark", theme === "dark");
  button.classList.toggle("is-light", theme === "light");
  button.setAttribute("aria-label", buttonLabel);
  button.setAttribute("aria-pressed", String(theme === "dark"));
  button.setAttribute("title", buttonLabel);

  if (srOnlyLabel instanceof HTMLElement) {
    srOnlyLabel.textContent = buttonLabel;
  }
}

function setupThemeToggle() {
  const button = document.getElementById("themeToggleBtn");
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.dataset.bound === "true") return;

  button.dataset.bound = "true";

  const matchMediaImpl = typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined;
  const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

  const applyResolvedTheme = () => {
    const preference = readStoredThemePreference(window.localStorage);
    const theme = resolveTheme(preference, matchMediaImpl);
    applyTheme(theme, preference);
    syncThemeToggleButton(button, preference, theme);
  };

  applyResolvedTheme();

  button.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const nextPreference: ThemePreference = currentTheme === "dark" ? "light" : "dark";
    writeStoredThemePreference(nextPreference, window.localStorage);
    applyTheme(nextPreference, nextPreference);
    syncThemeToggleButton(button, nextPreference, nextPreference);
  });

  const refreshAutoTheme = () => {
    if (readStoredThemePreference(window.localStorage) !== "auto") return;
    applyResolvedTheme();
  };

  mediaQuery?.addEventListener?.("change", refreshAutoTheme);
  window.setInterval(refreshAutoTheme, 60_000);
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

function scheduleServiceWorkerRegistration() {
  const run = () => {
    void setupServiceWorker();
  };

  const schedule = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 1500 });
      return;
    }

    window.setTimeout(run, 0);
  };

  if (document.readyState === "complete") {
    schedule();
    return;
  }

  window.addEventListener("load", schedule, { once: true });
}

scheduleServiceWorkerRegistration();
