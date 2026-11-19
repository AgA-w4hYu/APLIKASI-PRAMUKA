"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AutoRefresh({ seconds = 12, generatedAt }: { seconds?: number; generatedAt: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [last, setLast] = useState(generatedAt);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      router.refresh();
      setLast(new Date().toISOString());
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [enabled, router, seconds]);

  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: "var(--c-muted)" }}>
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: enabled ? "var(--c-success)" : "var(--c-border)" }}
        aria-hidden="true"
      />
      <span>
        {enabled ? "Diperbarui otomatis" : "Pembaruan otomatis dijeda"} ·{" "}
        {new Date(last).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
      <button type="button" className="link" onClick={() => setEnabled((v) => !v)}>
        {enabled ? "Jeda" : "Lanjutkan"}
      </button>
    </div>
  );
}
