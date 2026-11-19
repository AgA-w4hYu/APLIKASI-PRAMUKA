"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignaturePad, type SignatureValue } from "@/components/SignaturePad";
import { formatScore } from "@/lib/constants";

export function RevisionSignature({
  revisionId,
  oldTotal,
  newTotal,
}: {
  revisionId: number;
  oldTotal: number;
  newTotal: number;
}) {
  const router = useRouter();
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!signature) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/juri/revision/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId, signature }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Revisi tidak dapat ditandatangani.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Koneksi terputus. Coba lagi.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="card p-6 text-center">
        <h2 className="text-2xl font-semibold">Revisi ditandatangani</h2>
        <p className="mt-1" style={{ color: "var(--c-muted)" }}>
          Nilai baru <strong className="num">{formatScore(newTotal)}</strong> sekarang dipakai untuk peringkat.
        </p>
        <Link href="/juri" className="btn btn-primary mt-5">
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Tanda tangan persetujuan koreksi</h2>
      <p className="mt-1 text-base" style={{ color: "var(--c-muted)" }}>
        Total lama <span className="num">{formatScore(oldTotal)}</span> → total baru{" "}
        <span className="num font-semibold">{formatScore(newTotal)}</span>
      </p>
      <div className="mt-4">
        <SignaturePad onChange={setSignature} disabled={sending} />
      </div>
      <p className="mt-4 rounded-xl p-4 text-base" style={{ background: "var(--c-accent-soft)" }}>
        Dengan menandatangani, saya menyatakan koreksi panitia ini benar dan nilai baru boleh dipakai untuk peringkat.
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl p-3 text-base" style={{ background: "rgba(142,47,35,0.1)", color: "var(--c-danger)" }}>
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Link href="/juri" className="btn btn-secondary btn-lg">
          Nanti saja
        </Link>
        <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={sending || !signature}>
          {sending ? "Mengirim…" : "Tanda tangani dan terapkan nilai baru"}
        </button>
      </div>
    </section>
  );
}
