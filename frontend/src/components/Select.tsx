"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { prefersReducedMotion } from "@/lib/anim";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown on the trigger when no option matches `value`. */
  placeholder?: string;
  /** Disables the whole control. */
  disabled?: boolean;
  /** Stretch to fill the parent (otherwise sized to content, like width:auto). */
  fullWidth?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Animated, accessible dropdown that replaces the native <select> so the option
 * panel can be styled and animated (framer-motion). Keyboard, type-ahead and
 * click-outside behaviours mirror a native combobox; motion no-ops under
 * prefers-reduced-motion.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  fullWidth = false,
  ariaLabel,
  className,
  style,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // highlighted option index
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ buf: string; t: number }>({ buf: "", t: 0 });
  const baseId = useId();
  const reduce = prefersReducedMotion();

  const selected = options.find((o) => o.value === value);

  const firstEnabled = () => options.findIndex((o) => !o.disabled);

  // Close when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // On open, highlight the current selection (or the first selectable option).
  useEffect(() => {
    if (!open) return;
    const i = options.findIndex((o) => o.value === value && !o.disabled);
    setActive(i >= 0 ? i : firstEnabled());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (!open || active < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function commit(idx: number) {
    const o = options[idx];
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
  }

  function move(dir: 1 | -1) {
    setActive((cur) => {
      let i = cur < 0 ? (dir === 1 ? -1 : 0) : cur;
      for (let n = 0; n < options.length; n++) {
        i = (i + dir + options.length) % options.length;
        if (!options[i].disabled) return i;
      }
      return cur;
    });
  }

  function onTypeahead(key: string) {
    const now = performance.now();
    const ta = typeahead.current;
    ta.buf = now - ta.t > 600 ? key : ta.buf + key;
    ta.t = now;
    const match = options.findIndex(
      (o) => !o.disabled && o.label.toLowerCase().startsWith(ta.buf.toLowerCase()),
    );
    if (match >= 0) setActive(match);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActive(firstEnabled());
        break;
      case "End":
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i].disabled) {
            setActive(i);
            break;
          }
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1) onTypeahead(e.key);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`select${fullWidth ? " full" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      <button
        type="button"
        className={`select-trigger${open ? " open" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${baseId}-list`}
        aria-activedescendant={
          open && active >= 0 ? `${baseId}-opt-${active}` : undefined
        }
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        <span className={`select-value${selected ? "" : " placeholder"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <motion.svg
          className="select-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            ref={listRef}
            id={`${baseId}-list`}
            role="listbox"
            className="select-panel origin-top"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: reduce ? 0.12 : 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {options.map((o, i) => (
              <motion.li
                key={`${o.value}-${i}`}
                id={`${baseId}-opt-${i}`}
                data-idx={i}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                className={[
                  "select-option",
                  i === active ? "active" : "",
                  o.value === value ? "selected" : "",
                  o.disabled ? "disabled" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                // Cap the cascade so long language lists don't lag.
                transition={{ delay: reduce ? 0 : Math.min(i * 0.012, 0.12) }}
                onMouseEnter={() => !o.disabled && setActive(i)}
                onClick={() => commit(i)}
              >
                <span className="select-option-label">{o.label}</span>
                {o.value === value ? (
                  <svg
                    className="select-check"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : null}
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
