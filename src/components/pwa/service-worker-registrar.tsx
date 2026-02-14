"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && navigator.serviceWorker) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(
        (registration) => {
          console.log("SW registered:", registration.scope);
        },
        (error) => {
          console.error("SW registration failed:", error);
        }
      );
    }
  }, []);

  return null;
}
