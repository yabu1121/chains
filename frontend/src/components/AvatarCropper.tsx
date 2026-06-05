"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/lib/dialog";
import { useI18n } from "@/lib/i18n";

// Square crop: drag to reposition, slider to zoom. The picked image is drawn
// into a square <canvas> and handed back as a JPEG blob, so the stored avatar
// is always square (and small) regardless of the source aspect ratio.
const VIEWPORT = 280; // on-screen crop square (px)
const OUTPUT = 512; // exported square (px)

export function AvatarCropper({
  src,
  onCancel,
  onConfirm,
}: {
  src: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const { t } = useI18n();
  const dialogRef = useDialog<HTMLDivElement>(onCancel);
  const imgRef = useRef<HTMLImageElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Scale at zoom=1 makes the shorter side exactly fill the viewport (cover).
  const baseScale = nat ? VIEWPORT / Math.min(nat.w, nat.h) : 1;

  const dimsFor = useCallback(
    (z: number) => {
      const s = baseScale * z;
      return { s, dw: (nat?.w ?? 0) * s, dh: (nat?.h ?? 0) * s };
    },
    [baseScale, nat],
  );

  // Keep the image covering the viewport at all times.
  const clampOff = useCallback(
    (o: { x: number; y: number }, dw: number, dh: number) => ({
      x: Math.min(0, Math.max(VIEWPORT - dw, o.x)),
      y: Math.min(0, Math.max(VIEWPORT - dh, o.y)),
    }),
    [],
  );

  function onImgLoad(e: SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const s = VIEWPORT / Math.min(w, h);
    setNat({ w, h });
    setZoom(1);
    setOff({ x: (VIEWPORT - w * s) / 2, y: (VIEWPORT - h * s) / 2 });
  }

  function handleZoom(z2: number) {
    if (!nat) {
      setZoom(z2);
      return;
    }
    // Zoom around the viewport centre so it doesn't drift while scaling.
    const { dw: dw1, dh: dh1 } = dimsFor(zoom);
    const { dw: dw2, dh: dh2 } = dimsFor(z2);
    const c = VIEWPORT / 2;
    const nx = c - (c - off.x) * (dw2 / dw1);
    const ny = c - (c - off.y) * (dh2 / dh1);
    setOff(clampOff({ x: nx, y: ny }, dw2, dh2));
    setZoom(z2);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || !nat) return;
    const { dw, dh } = dimsFor(zoom);
    setOff(
      clampOff(
        {
          x: drag.current.ox + (e.clientX - drag.current.px),
          y: drag.current.oy + (e.clientY - drag.current.py),
        },
        dw,
        dh,
      ),
    );
  }

  function onPointerUp() {
    drag.current = null;
  }

  function confirm() {
    const img = imgRef.current;
    if (!img || !nat) return;
    const { s } = dimsFor(zoom);
    // Natural-pixel region currently under the viewport.
    const sx = -off.x / s;
    const sy = -off.y / s;
    const sSize = VIEWPORT / s;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.9,
    );
  }

  if (!mounted) return null;

  const { dw, dh } = dimsFor(zoom);

  return createPortal(
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-card max-w-[360px]"
        role="dialog"
        aria-modal="true"
        aria-label={t.cropper.title}
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
      >
        <button className="modal-close" onClick={onCancel} aria-label={t.common.close}>
          ×
        </button>
        <h2 className="section-title">{t.cropper.title}</h2>
        <p className="muted mt-[-4px] text-[13px]">
          {t.cropper.desc}
        </p>

        <div
          className="cropper-viewport"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={onImgLoad}
            style={{
              position: "absolute",
              left: off.x,
              top: off.y,
              width: dw || VIEWPORT,
              height: dh || VIEWPORT,
              maxWidth: "none",
              userSelect: "none",
            }}
          />
          <div className="cropper-ring" />
        </div>

        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            handleZoom(Number(e.target.value))
          }
          aria-label="Zoom"
          className="mt-[14px]"
          style={{ width: VIEWPORT }}
        />

        <div className="mt-[14px] flex gap-2">
          <button
            className="primary w-auto"
            type="button"
            onClick={confirm}
          >
            {t.cropper.usePhoto}
          </button>
          <button
            className="ghost w-auto"
            type="button"
            onClick={onCancel}
          >
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
