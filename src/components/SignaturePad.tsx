"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SignatureValue {
  strokes: { t: number; x: number; y: number; p: number }[][];
  image: string;
  deviceTime: string;
}

interface SignaturePadProps {
  onChange: (value: SignatureValue | null) => void;
  disabled?: boolean;
}

/**
 * Kotak tanda tangan coret tangan. Menyimpan titik, tekanan, dan waktu agar
 * server dapat memeriksa bahwa goresannya cukup, bukan hanya kotak kosong.
 */
export function SignaturePad({ onChange, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const strokesRef = useRef<{ t: number; x: number; y: number; p: number }[][]>([]);
  const startedAt = useRef(0);
  const [hasInk, setHasInk] = useState(false);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#371F17";
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (const point of stroke.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = wrapper.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    paint();
  }, [paint]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  function emit() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const strokes = strokesRef.current.filter((stroke) => stroke.length > 1);
    if (strokes.length === 0) {
      onChange(null);
      return;
    }
    onChange({
      strokes,
      image: canvas.toDataURL("image/png"),
      deviceTime: new Date().toISOString(),
    });
  }

  function position(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      t: Date.now() - startedAt.current,
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top),
      p: event.pressure || 0.5,
    };
  }

  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    if (strokesRef.current.length === 0) startedAt.current = Date.now();
    strokesRef.current.push([position(event)]);
    setHasInk(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (!stroke) return;
    stroke.push(position(event));
    paint();
    if (stroke.length % 6 === 0) emit();
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    paint();
    emit();
  }

  function clear() {
    strokesRef.current = [];
    setHasInk(false);
    paint();
    onChange(null);
  }

  return (
    <div>
      <div
        ref={wrapperRef}
        className="relative w-full touch-none overflow-hidden rounded-2xl border-2 border-dashed bg-white"
        style={{ borderColor: "var(--c-border)", height: "clamp(180px, 32vh, 320px)" }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
          aria-label="Kotak tanda tangan. Tanda tangan memakai jari atau pena layar."
          role="img"
        />
        {!hasInk ? (
          <p
            className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-base"
            style={{ color: "var(--c-muted)" }}
          >
            Tanda tangan di dalam kotak ini memakai jari atau pena layar.
          </p>
        ) : null}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-8 left-8 right-8 border-b"
          style={{ borderColor: "rgba(55,31,23,0.18)" }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn btn-secondary min-h-[48px]" onClick={clear} disabled={!hasInk || disabled}>
          Hapus dan Ulangi
        </button>
        <p className="text-sm" style={{ color: "var(--c-muted)" }}>
          Saran: putar HP ke mode lanskap agar kotak lebih lebar.
        </p>
      </div>
    </div>
  );
}
