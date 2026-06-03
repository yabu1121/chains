import { useEffect, useRef } from "react";

/**
 * Minimal modal accessibility wiring shared by the dialog components:
 * - Escape closes the dialog.
 * - Initial focus moves into the dialog when it opens.
 * - Focus is restored to the element that had it (the trigger) on close.
 *
 * This intentionally does NOT hand-roll a focus *trap* (cycling Tab within the
 * dialog): per the design-skills guidance, custom focus-trapping should use an
 * established primitive (Radix / Base UI Dialog) rather than bespoke key
 * handling. Adopting one of those is the recommended next step for full
 * focus management.
 *
 * Returns a ref to attach to the dialog container; the first focusable element
 * inside it (or the container itself) receives initial focus.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    // Move focus into the dialog (first focusable, else the container).
    const node = ref.current;
    const focusable = node?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? node)?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus to the trigger so keyboard users are not dropped at the
      // top of the page after closing.
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return ref;
}
