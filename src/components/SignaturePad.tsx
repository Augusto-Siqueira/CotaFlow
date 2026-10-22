"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClasses } from "@/components/Button";

/**
 * Campo de assinatura escrita: desenha com o dedo (celular) ou o mouse.
 * Devolve a imagem em PNG (data URL) a cada traço, ou null quando limpa.
 */
export function SignaturePad({
  label,
  onChange,
}: {
  label: string;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Tamanho interno fixo (a imagem salva sai sempre igual), esticado na tela pelo CSS.
  const W = 600;
  const H = 200;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e3a8a";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (!empty) onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }

  function clear() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    setEmpty(true);
    onChange(null);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-navy-700">{label}</span>
        <button type="button" onClick={clear} disabled={empty} className={`${buttonClasses("secondary", "sm")} disabled:cursor-not-allowed`}>
          Limpar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        aria-label={`${label}: assine com o dedo ou o mouse`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="h-36 w-full cursor-crosshair touch-none rounded-lg border-2 border-dashed border-navy-300 bg-white"
      />
      <p className="mt-1 text-xs text-navy-500">{empty ? "Assine dentro do quadro." : "✓ Assinado"}</p>
    </div>
  );
}
