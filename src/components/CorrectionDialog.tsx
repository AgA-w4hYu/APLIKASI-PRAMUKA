"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Item {
  id: number;
  name: string;
  max: number;
}

interface Penalty {
  id: number;
  name: string;
  value: number;
}

export function CorrectionDialog({
  scoreId,
  teamName,
  total,
  items,
  penalties,
  values,
  penaltyIds,
  revisions,
}: {
  scoreId: number;
  teamName: string;
  total: number;
  items: Item[];
  penalties: Penalty[];
  values: Record<string, number>;
  penaltyIds: number[];
  revisions: { reason: string; admin_name: string; old_total: number; new_total: number; created_at: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>(values);
  const [selected, setSelected] = useState<number[]>(penaltyIds);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/scores/${scoreId}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: draft, penaltyIds: selected, reason }),
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(data.error ?? "Koreksi tidak tersimpan.");
        return;
      }
      setNotice(
        data.message ??
          "Revisi tersimpan dan menunggu tanda tangan ulang juri. Peringkat tetap memakai nilai lama sampai ditandatangani.",
      );
      router.refresh();
    } catch {
      setError("Koneksi terputus. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  const preview = (() => {
    let raw = 0;
    let max = 0;
    for (const item of items) {
      raw += Math.min(Math.max(Number(draft[String(item.id)] ?? 0), 0), item.max);
      max += item.max;
    }
    return Math.max(0, (max > 0 ? (raw / max) * 100 : 0) - penalties.filter((p) => selected.includes(p.id)).reduce((s, p) => s + p.value, 0));
  })();

  return (
    <>
      <div className="flex gap-3">
        <button type="button" className="btn btn-secondary text-sm" onClick={() => setOpen(true)}>
          Koreksi
        </button>
        {revisions.length > 0 ? (
          <button type="button" className="link text-sm" onClick={() => setShowHistory((s) => !s)}>
            Riwayat ({revisions.length})
          </button>
        ) : null}
      </div>

      {showHistory ? (
        <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--c-muted)" }}>
          {revisions.map((rev, index) => (
            <li key={index}>
              {new Date(rev.created_at).toLocaleString("id-ID")} · {rev.admin_name}: {rev.old_total.toFixed(2)} →{" "}
              {rev.new_total.toFixed(2)} — {rev.reason}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Koreksi nilai ${teamName}`}
          className="fixed inset-0 z-50 flex items-end justify-center overflow-auto p-4 sm:items-center"
          style={{ background: "rgba(55,31,23,0.55)" }}
        >
          <div className="card w-full max-w-2xl p-6">
            <h2 className="text-2xl font-semibold">Koreksi nilai {teamName}</h2>
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>
              Nilai lama {total.toFixed(2)}. Setiap koreksi tersimpan sebagai revisi baru dan tercatat di riwayat.
            </p>

            <div className="mt-4 max-h-[45vh] space-y-3 overflow-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <label htmlFor={`corr-${item.id}`} className="flex-1 text-sm">
                    {item.name}
                  </label>
                  <input
                    id={`corr-${item.id}`}
                    type="number"
                    min={0}
                    max={item.max}
                    step={0.5}
                    className="input num w-24 !py-2 text-right"
                    value={draft[String(item.id)] ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [String(item.id)]: Number(e.target.value) }))
                    }
                  />
                  <span className="num w-10 text-xs" style={{ color: "var(--c-muted)" }}>
                    /{item.max}
                  </span>
                </div>
              ))}
            </div>

            {penalties.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {penalties.map((penalty) => {
                  const active = selected.includes(penalty.id);
                  return (
                    <button
                      key={penalty.id}
                      type="button"
                      onClick={() =>
                        setSelected((prev) => (active ? prev.filter((p) => p !== penalty.id) : [...prev, penalty.id]))
                      }
                      aria-pressed={active}
                      className="badge"
                      style={active ? { background: "rgba(142,47,35,0.15)", color: "var(--c-danger)" } : {}}
                    >
                      {penalty.name} · −{penalty.value}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-4">
              <label htmlFor="corr-reason" className="label">
                Alasan koreksi (wajib)
              </label>
              <textarea
                id="corr-reason"
                rows={2}
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: salah membaca nilai kriteria jalan di tempat."
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--c-muted)" }}>
                Total baru: <strong className="num">{preview.toFixed(2)}</strong>
              </span>
              {error ? (
                <span role="alert" className="text-sm" style={{ color: "var(--c-danger)" }}>
                  {error}
                </span>
              ) : null}
            </div>

            {notice ? (
              <p role="status" className="mt-3 rounded-xl p-3 text-sm" style={{ background: "var(--c-accent-soft)" }}>
                {notice}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                {notice ? "Tutup" : "Batal"}
              </button>
              {notice ? null : (
                <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || reason.trim().length < 5}>
                  {saving ? "Menyimpan…" : "Simpan koreksi"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
