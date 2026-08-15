"use client";

import { useEffect, useState } from "react";

// A tiny imperative toast: `toastError(msg)` can be called from anywhere (a
// catch handler, a hook) without a context/hook, and the mounted <ToastHost />
// renders the messages. Used to give fire-and-forget list mutations the same
// failure feedback the dialog flows already have.

type Listener = (message: string) => void;
const listeners = new Set<Listener>();
let counter = 0;

/** Show a transient error toast. The caller passes an already-localised string. */
export function toastError(message: string): void {
  listeners.forEach((l) => l(message));
}

interface Toast {
  id: number;
  message: string;
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener: Listener = (message) => {
      const id = ++counter;
      setToasts((cur) => [...cur, { id, message }]);
      window.setTimeout(
        () => setToasts((cur) => cur.filter((t) => t.id !== id)),
        4000,
      );
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast-item">
          {t.message}
        </div>
      ))}
    </div>
  );
}
