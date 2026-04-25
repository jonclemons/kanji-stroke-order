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

function scrollMainToTop() {
  const main = document.querySelector(".main-content");
  if (main instanceof HTMLElement) {
    main.scrollTo({ top: 0 });
  }
  window.scrollTo({ top: 0 });
}

function setKanjiDetailView(showList: boolean) {
  document.querySelectorAll("[data-kanji-detail-switcher]").forEach((switcher) => {
    const detailPanel = switcher.querySelector("[data-kanji-detail-panel]");
    const listPanel = switcher.querySelector("[data-kanji-list-panel]");

    if (detailPanel instanceof HTMLElement) {
      detailPanel.classList.toggle("hidden", showList);
    }

    if (listPanel instanceof HTMLElement) {
      listPanel.classList.toggle("hidden", !showList);
    }
  });

  document.querySelectorAll("[data-kanji-detail-only]").forEach((element) => {
    if (element instanceof HTMLElement) {
      element.classList.toggle("hidden", showList);
    }
  });

  document.querySelectorAll("[data-kanji-list-toggle]").forEach((element) => {
    if (element instanceof HTMLElement) {
      element.classList.toggle("is-active", showList);
      element.setAttribute("aria-pressed", String(showList));
    }
  });

  window.requestAnimationFrame(scrollMainToTop);
}

function setupKanjiDetailSwitcher() {
  document.querySelectorAll("[data-kanji-list-toggle]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.dataset.bound === "true") return;

    button.dataset.bound = "true";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      setKanjiDetailView(true);
    });
  });

  document.querySelectorAll("[data-kanji-list-panel]").forEach((panel) => {
    if (!(panel instanceof HTMLElement)) return;
    if (panel.dataset.bound === "true") return;

    panel.dataset.bound = "true";
    panel.addEventListener("click", (event) => {
      const link = event.target instanceof Element ? event.target.closest("a.kanji-grid-btn[aria-current='page']") : null;
      if (!link) return;

      event.preventDefault();
      setKanjiDetailView(false);
    });
  });

  window.addEventListener("kanji-view:show-detail", () => {
    setKanjiDetailView(false);
  });
}

setupKanjiDetailSwitcher();

let activePrintFrame: HTMLIFrameElement | null = null;

function printInHiddenFrame(url: string, title: string) {
  activePrintFrame?.remove();

  const previousTitle = document.title;
  const frame = document.createElement("iframe");
  activePrintFrame = frame;
  frame.setAttribute("aria-hidden", "true");
  frame.title = title;
  frame.name = title;
  frame.style.position = "fixed";
  frame.style.inset = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";

  const cleanup = () => {
    window.setTimeout(() => {
      if (activePrintFrame === frame) {
        activePrintFrame = null;
      }
      document.title = previousTitle;
      frame.remove();
    }, 1000);
  };

  document.title = title;

  frame.addEventListener(
    "load",
    () => {
      const printWindow = frame.contentWindow;
      if (!printWindow) {
        window.location.href = url;
        return;
      }

      printWindow.document.title = title;
      printWindow.addEventListener("afterprint", cleanup, { once: true });
      printWindow.focus();
      printWindow.print();
      window.setTimeout(cleanup, 15_000);
    },
    { once: true },
  );

  frame.src = url;
  document.body.appendChild(frame);
}

function setupDirectPrintLinks() {
  document.querySelectorAll("[data-print-now]").forEach((link) => {
    if (!(link instanceof HTMLAnchorElement)) return;
    if (link.dataset.bound === "true") return;

    link.dataset.bound = "true";
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

      event.preventDefault();
      printInHiddenFrame(link.href, link.dataset.printTitle || document.title);
    });
  });
}

setupDirectPrintLinks();

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
