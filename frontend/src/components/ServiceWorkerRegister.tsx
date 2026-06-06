"use client";

import { useEffect } from "react";

// Registers the service worker (public/sw.js) once on the client, after load so
// it never competes with first paint. Skipped in development — an active SW
// caching _next assets fights Next's hot reload. Renders nothing.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () =>
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration is best-effort; the app works without it */
      });
    // This effect runs after hydration, by which point `load` has usually
    // already fired — listening for it would miss the event and never register.
    // So register immediately when the document is ready, else wait for load.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
