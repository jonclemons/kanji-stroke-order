import { render } from "preact";
import App from "./App.jsx";
import "../app.js";

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

  const registration = await navigator.serviceWorker.register("/sw.js", {
    updateViaCache: "none",
  });
  await registration.update();
}

render(<App />, document.getElementById("app"));

requestAnimationFrame(() => {
  window.initLegacyApp?.();
});

void setupServiceWorker();
