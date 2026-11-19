"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { SignaturePad, type SignatureValue } from "@/components/SignaturePad";
import { formatClock, formatScore } from "@/lib/constants";

export interface FormItem {
  id: number;
  name: string;
  hint: string | null;
  max: number;
  section: string;
}

export interface FormPenalty {
  id: number;
  name: string;
  value: number;
}

interface ScoreFormProps {
  contestId: number;
  contestName: string;
  teamId: number;
  teamName: string;
  teamNpp: string;
  position: number;
  categoryLabel: string;
  categoryColor: string;
  progress: { done: number; total: number };
  sections: { name: string; items: FormItem[] }[];
  penalties: FormPenalty[];
  existing: { id: number; status: string; total: number; values: Record<string, number>; penaltyIds: number[] } | null;
  stopwatch: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "offline" | "error";
type Step = "isi" | "periksa" | "tanda" | "sukses";

function computeLocal(items: FormItem[], values: Record<string, number>, penalties: FormPenalty[], selected: number[]) {
  let raw = 0;
  let max = 0;
  for (const item of items) {
    const entered = values[String(item.id)];
    const v = Math.min(Math.max(Number(entered ?? 0) || 0, 0), item.max);
    raw += v;
    max += item.max;
  }
  const penaltyTotal = penalties.filter((p) => selected.includes(p.id)).reduce((s, p) => s + Math.abs(p.value), 0);
  const normalized = max > 0 ? (raw / max) * 100 : 0;
  return Math.min(100, Math.max(0, Math.round((normalized - penaltyTotal) * 100) / 100));
}

export function ScoreForm(props: ScoreFormProps) {
  const router = useRouter();
  const items = useMemo(() => props.sections.flatMap((s) => s.items), [props.sections]);
  const [values, setValues] = useState<Record<string, number>>(props.existing?.values ?? {});
  const [selectedPenalties, setSelectedPenalties] = useState<number[]>(props.existing?.penaltyIds ?? []);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<Step>("isi");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [nextMessage, setNextMessage] = useState<string | null>(null);
  const dirty = useRef(false);
  const valuesRef = useRef(values);
  const penaltiesRef = useRef(selectedPenalties);

  valuesRef.current = values;
  penaltiesRef.current = selectedPenalties;

  const locked = props.existing ? props.existing.status !== "draf" : false;
  const total = useMemo(
    () => computeLocal(items, values, props.penalties, selectedPenalties),
    [items, values, props.penalties, selectedPenalties],
  );
  const missing = items.filter((item) => values[String(item.id)] === undefined);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const persist = useCallback(
    async (action: "draft" | "submit", signatureValue?: SignatureValue | null) => {
      const payload = {
        contestId: props.contestId,
        teamId: props.teamId,
        values: valuesRef.current,
        penaltyIds: penaltiesRef.current,
        notes,
        action,
        ...(action === "submit" ? { signature: signatureValue ?? undefined } : {}),
      };
      setSaveState("saving");
      setError(null);
      try {
        const response = await fetch("/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as { error?: string; savedAt?: string; status?: string };
        if (!response.ok) {
          setSaveState("error");
          setError(data.error ?? "Nilai tidak dapat disimpan.");
          return null;
        }
        window.localStorage.removeItem(`ab9-draft-${props.contestId}-${props.teamId}`);
        setSaveState("saved");
        setSavedAt(data.savedAt ?? new Date().toISOString());
        return data;
      } catch {
        if (action === "draft") {
          window.localStorage.setItem(`ab9-draft-${props.contestId}-${props.teamId}`, JSON.stringify(payload));
        }
        setSaveState("offline");
        if (action === "submit") {
          setError("Koneksi terputus. Nilai dan tanda tangan belum terkirim; sambungkan jaringan lalu coba lagi.");
        }
        return null;
      }
    },
    [notes, props.contestId, props.teamId],
  );

  useEffect(() => {
    if (!dirty.current || locked || step === "sukses") return;
    const id = window.setTimeout(() => {
      void persist("draft");
    }, 1200);
    return () => window.clearTimeout(id);
  }, [values, selectedPenalties, notes, locked, step, persist]);

  useEffect(() => {
    if (offline || locked) return;
    const pending = window.localStorage.getItem(`ab9-draft-${props.contestId}-${props.teamId}`);
    if (!pending) return;
    void (async () => {
      try {
        await fetch("/api/scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: pending });
        window.localStorage.removeItem(`ab9-draft-${props.contestId}-${props.teamId}`);
        setSaveState("saved");
        setSavedAt(new Date().toISOString());
      } catch {
        setSaveState("offline");
      }
    })();
  }, [offline, locked, props.contestId, props.teamId]);

  function setValue(id: number, raw: string, max: number) {
    if (locked) return;
    dirty.current = true;
    setValues((prev) => {
      const next = { ...prev };
      if (raw.trim() === "") {
        delete next[String(id)];
        return next;
      }
      const parsed = Number(raw);
      next[String(id)] = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), max) : 0;
      return next;
    });
  }

  function nudge(id: number, delta: number, max: number) {
    setValue(id, String((values[String(id)] ?? 0) + delta), max);
  }

  function togglePenalty(id: number) {
    if (locked) return;
    dirty.current = true;
    setSelectedPenalties((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (!signature) return;
    if (missing.length > 0) {
      setError("Masih ada butir yang kosong. Lengkapi dulu sebelum mengirim.");
      setStep("isi");
      return;
    }
    setSubmitting(true);
    const result = await persist("submit", signature);
    setSubmitting(false);
    if (result) {
      setSignedAt(new Date().toISOString());
      setStep("sukses");
      router.refresh();
    }
  }

  async function callNext() {
    setSubmitting(true);
    setNextMessage(null);
    try {
      const response = await fetch(`/api/juri/next?contestId=${props.contestId}`, { method: "POST" });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setNextMessage(data.error ?? "Belum bisa memanggil tim berikutnya.");
        return;
      }
      router.push("/juri");
      router.refresh();
    } catch {
      setNextMessage("Koneksi terputus. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "sukses") {
    return (
      <div className="card p-6 text-center rise sm:p-8">
        <span
          className="mx-auto grid h-16 w-16 place-items-center rounded-full pop"
          style={{ background: "rgba(96,106,70,0.15)", color: "var(--c-success)" }}
        >
          <Icon name="check" size={32} />
        </span>
        <h2 className="mt-4 text-2xl font-semibold">Nilai terkirim dan ditandatangani</h2>
        <p className="mt-1" style={{ color: "var(--c-muted)" }}>
          {props.teamName} · {props.contestName} · pukul {formatClock(signedAt)}
        </p>
        <p className="num mt-4 text-4xl font-semibold">{formatScore(total)}</p>
        {signature ? (
          <img
            src={signature.image}
            alt="Tanda tangan yang baru Anda buat"
            className="mx-auto mt-4 h-24 w-auto max-w-full rounded-lg border bg-white p-1"
            style={{ borderColor: "var(--c-border)" }}
          />
        ) : null}
        <p className="mt-4 text-sm" style={{ color: "var(--c-muted)" }}>
          Nilai terkunci dan tidak dapat Anda ubah. Panitia dapat mengoreksi dengan alasan tertulis; koreksi harus Anda
          tandatangani ulang.
        </p>
        {nextMessage ? (
          <p role="alert" className="mt-3 rounded-xl p-3 text-sm" style={{ background: "var(--c-accent-soft)" }}>
            {nextMessage}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" className="btn btn-primary btn-lg" onClick={callNext} disabled={submitting}>
            Panggil Tim Berikutnya
          </button>
          <Link href="/juri" className="btn btn-secondary btn-lg">
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="rounded-2xl px-5 py-4 text-white" style={{ background: props.categoryColor }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">
          Tim ke-{props.position} · {props.categoryLabel}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="display text-2xl font-semibold sm:text-3xl">{props.teamName}</h1>
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm">{props.contestName}</span>
        </div>
        <p className="num mt-1 text-sm opacity-80">{props.teamNpp}</p>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          {props.stopwatch ? (
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => setTimerRunning((r) => !r)}
              aria-pressed={timerRunning}
            >
              <Icon name="clock" size={16} />
              <span className="num">
                {String(Math.floor(elapsed / 60)).padStart(2, "0")}.{String(elapsed % 60).padStart(2, "0")}
              </span>
            </button>
          ) : null}
          <span className="text-sm" style={{ color: "var(--c-muted)" }}>
            {props.progress.done} dari {props.progress.total} tim sudah dinilai
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--c-muted)" }}>
          <span aria-live="polite">
            {saveState === "saving"
              ? "Menyimpan…"
              : saveState === "saved" && savedAt
                ? `Tersimpan otomatis pukul ${formatClock(savedAt)}`
                : saveState === "offline"
                  ? "Koneksi terputus — nilai disimpan di perangkat"
                  : saveState === "error"
                    ? "Gagal menyimpan"
                    : "Draf tersimpan otomatis"}
          </span>
          <span
            className="rounded-full px-3 py-1 text-sm font-semibold"
            style={{ background: "var(--c-primary-soft)" }}
            aria-label={`Total sementara ${formatScore(total)}`}
          >
            <span className="num">{formatScore(total)}</span>
          </span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl p-3 text-base" style={{ background: "rgba(142,47,35,0.1)", color: "var(--c-danger)" }}>
          {error}
        </p>
      ) : null}

      {step === "tanda" ? (
        <section className="card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Tanda tangan juri</h2>
          <p className="mt-1 text-base" style={{ color: "var(--c-muted)" }}>
            {props.teamName} · {props.contestName} · total <strong className="num">{formatScore(total)}</strong>
          </p>
          <div className="mt-4">
            <SignaturePad onChange={setSignature} disabled={submitting} />
          </div>
          <p className="mt-4 rounded-xl p-4 text-base font-medium" style={{ background: "var(--c-accent-soft)" }}>
            Dengan menandatangani, saya menyatakan nilai ini benar dan tidak dapat saya ubah setelah dikirim.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setStep("periksa")} disabled={submitting}>
              Kembali ke Periksa
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleSubmit}
              disabled={submitting || !signature || offline}
            >
              {submitting ? "Mengirim…" : "Kirim Nilai dengan Tanda Tangan"}
            </button>
          </div>
          {!signature ? (
            <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>
              Tombol kirim aktif setelah tanda tangan cukup panjang.
            </p>
          ) : null}
        </section>
      ) : step === "periksa" ? (
        <section className="card p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Periksa kembali</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
            Nomor urut dan kategori adalah identitas utama tim ini.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-base">
              <thead>
                <tr className="text-left" style={{ color: "var(--c-muted)" }}>
                  <th className="py-2 font-semibold">Kriteria</th>
                  <th className="py-2 text-right font-semibold">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t" style={{ borderColor: "var(--c-border)" }}>
                    <td className="py-2">{item.name}</td>
                    <td className="num py-2 text-right font-semibold">
                      {values[String(item.id)] ?? "—"}{" "}
                      <span className="font-normal" style={{ color: "var(--c-muted)" }}>
                        dari {item.max}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {props.penalties.length > 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--c-muted)" }}>
              Penalti dipilih: {selectedPenalties.length === 0 ? "tidak ada" : selectedPenalties
                .map((id) => props.penalties.find((p) => p.id === id)?.name)
                .filter(Boolean)
                .join(", ")}
            </p>
          ) : null}
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl p-4" style={{ background: "var(--c-primary-soft)" }}>
            <span className="text-base font-semibold">Total nilai</span>
            <span className="num text-3xl font-semibold">{formatScore(total)}</span>
          </div>
          {missing.length > 0 ? (
            <p role="alert" className="mt-3 rounded-xl p-3 text-base" style={{ background: "rgba(142,47,35,0.1)", color: "var(--c-danger)" }}>
              Masih ada {missing.length} kriteria kosong: {missing.map((m) => m.name).join(", ")}.
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setStep("isi")}>
              Kembali mengisi
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => setStep("tanda")}
              disabled={missing.length > 0}
            >
              Lanjut ke Tanda Tangan
            </button>
          </div>
        </section>
      ) : (
        <>
          {props.sections.map((section) => (
            <section key={section.name} className="card p-5 sm:p-6">
              <h2 className="text-lg font-semibold">{section.name}</h2>
              <div className="mt-3 space-y-5">
                {section.items.map((item) => (
                  <ItemInput
                    key={item.id}
                    item={item}
                    value={values[String(item.id)]}
                    locked={locked}
                    onChange={setValue}
                    onNudge={nudge}
                  />
                ))}
              </div>
            </section>
          ))}

          <section className="card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Penalti</h2>
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>
              Pilih hanya bila benar-benar terjadi. Penalti dikurangkan dari total.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {props.penalties.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--c-muted)" }}>
                  Tidak ada penalti pada lomba ini.
                </p>
              ) : (
                props.penalties.map((penalty) => {
                  const active = selectedPenalties.includes(penalty.id);
                  return (
                    <button
                      key={penalty.id}
                      type="button"
                      onClick={() => togglePenalty(penalty.id)}
                      aria-pressed={active}
                      className="btn btn-secondary min-h-[56px]"
                      style={active ? { borderColor: "var(--c-danger)", color: "var(--c-danger)" } : undefined}
                      disabled={locked}
                    >
                      <span className="grid h-5 w-5 place-items-center rounded border" style={{ borderColor: "currentColor" }}>
                        {active ? <Icon name="check" size={14} /> : null}
                      </span>
                      {penalty.name} · −{penalty.value}
                    </button>
                  );
                })
              )}
            </div>

            <label htmlFor="notes" className="label mt-5">
              Catatan untuk panitia (opsional)
            </label>
            <textarea
              id="notes"
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={locked}
              placeholder="Contoh: tim terlambat 2 menit karena hujan."
            />
          </section>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t p-3 backdrop-blur lg:static lg:mt-2 lg:rounded-2xl lg:border" style={{ borderColor: "var(--c-border)", background: "color-mix(in srgb, var(--c-surface) 94%, transparent)" }}>
        <div className="mx-auto flex max-w-wide items-center justify-between gap-3">
          <div>
            <p className="text-xs" style={{ color: "var(--c-muted)" }}>
              Total sementara
            </p>
            <p className="num text-2xl font-semibold">{formatScore(total)}</p>
          </div>
          <div className="flex gap-2">
            {step === "isi" ? (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => setStep("periksa")}
                disabled={locked}
              >
                Periksa Kembali
              </button>
            ) : null}
            <Link href="/juri" className="btn btn-secondary btn-lg">
              Keluar
            </Link>
          </div>
        </div>
      </div>

      {locked ? (
        <p className="rounded-xl p-3 text-sm" style={{ background: "var(--c-accent-soft)" }}>
          Nilai ini sudah dikirim dan terkunci. Hubungi panitia bila perlu koreksi.
        </p>
      ) : null}
    </div>
  );
}

function ItemInput({
  item,
  value,
  locked,
  onChange,
  onNudge,
}: {
  item: FormItem;
  value: number | undefined;
  locked: boolean;
  onChange: (id: number, raw: string, max: number) => void;
  onNudge: (id: number, delta: number, max: number) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={`item-${item.id}`} className="text-lg font-semibold">
          {item.name}
        </label>
        <span className="text-lg font-medium" style={{ color: "var(--c-muted)" }}>
          {value === undefined ? "Belum diisi" : `${value} dari ${item.max}`}
        </span>
      </div>
      {item.hint ? (
        <p className="mt-0.5 text-sm" style={{ color: "var(--c-muted)" }}>
          {item.hint}
        </p>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary min-h-[56px] w-14 text-xl"
          onClick={() => onNudge(item.id, -1, item.max)}
          aria-label={`Kurangi nilai ${item.name}`}
          disabled={locked}
        >
          −
        </button>
        <input
          id={`item-${item.id}`}
          type="number"
          inputMode="decimal"
          min={0}
          max={item.max}
          step={0.5}
          value={value ?? ""}
          onChange={(e) => onChange(item.id, e.target.value, item.max)}
          disabled={locked}
          placeholder="—"
          className="input num min-h-[56px] flex-1 text-center text-2xl font-semibold"
        />
        <button
          type="button"
          className="btn btn-secondary min-h-[56px] w-14 text-xl"
          onClick={() => onNudge(item.id, 1, item.max)}
          aria-label={`Tambah nilai ${item.name}`}
          disabled={locked}
        >
          +
        </button>
      </div>
    </div>
  );
}
