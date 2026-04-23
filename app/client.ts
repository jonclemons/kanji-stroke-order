import { createClient } from "honox/client";
import { APP_VERSION } from "../src/version.js";

createClient();

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
