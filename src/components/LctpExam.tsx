"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";

export interface ExamData {
  sessionId: number;
  contestName: string;
  endsAt: string;
  serverNow: string;
  durationMin: number;
  questions: { id: number; text: string; imageUrl: string | null; options: string[]; score: number }[];
  answers: Record<string, number>;
  status: string;
}

export function LctpExam({
  contestId,
  contestName,
  teamName,
  teamSize,
  durationMin,
  questionCount,
  initialExam,
}: {
  contestId: number;
  contestName: string;
  teamName: string;
  teamSize: number;
  durationMin: number;
  questionCount: number;
  initialExam: ExamData | null;
}) {
  const router = useRouter();
  const [exam, setExam] = useState<ExamData | null>(initialExam);
  const [answers, setAnswers] = useState<Record<string, number>>(initialExam?.answers ?? {});
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [finished, setFinished] = useState(initialExam?.status === "selesai");
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const answersRef = useRef(answers);
  const submittedRef = useRef(false);
  answersRef.current = answers;

  const question = exam?.questions[index];

  useEffect(() => {
    if (!exam || exam.status === "selesai") return;
    const tick = () => {
      const diff = new Date(exam.endsAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(diff / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [exam]);

  const finish = useCallback(
    async (auto = false) => {
      if (!exam || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        await fetch("/api/lctp/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: exam.sessionId }),
        });
      } catch {
        // Waktu habis tetapi koneksi putus: jawaban sudah tersimpan di server per soal.
      }
      setSubmitting(false);
      setFinished(true);
      setConfirmFinish(false);
      if (auto) setError("Waktu habis. Jawaban Anda sudah dikumpulkan.");
      router.refresh();
    },
    [exam, router],
  );

  useEffect(() => {
    if (exam && exam.status !== "selesai" && remaining === 0 && exam.questions.length > 0 && !finished) {
      void finish(true);
    }
  }, [remaining, exam, finish, finished]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/lctp/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contestId }),
      });
      const data = (await response.json()) as { error?: string; exam?: ExamData };
      if (!response.ok || !data.exam) {
        setError(data.error ?? "Ujian tidak dapat dimulai.");
        return;
      }
      setExam(data.exam);
      setAnswers(data.exam.answers);
    } catch {
      setError("Koneksi terputus. Coba mulai lagi saat jaringan pulih.");
    } finally {
      setStarting(false);
    }
  }

  async function choose(choice: number) {
    if (!exam || !question) return;
    setAnswers((prev) => ({ ...prev, [String(question.id)]: choice }));
    setSavingState("saving");
    try {
      const response = await fetch("/api/lctp/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: exam.sessionId, questionId: question.id, choice }),
      });
      if (!response.ok) throw new Error("gagal");
      window.localStorage.removeItem(`ab9-answer-${exam.sessionId}-${question.id}`);
      setSavingState("saved");
    } catch {
      window.localStorage.setItem(
        `ab9-answer-${exam.sessionId}-${question.id}`,
        JSON.stringify({ sessionId: exam.sessionId, questionId: question.id, choice }),
      );
      setSavingState("offline");
    }
  }

  useEffect(() => {
    if (!exam) return;
    const retry = async () => {
      for (const key of Object.keys(window.localStorage)) {
        if (!key.startsWith(`ab9-answer-${exam.sessionId}-`)) continue;
        const payload = window.localStorage.getItem(key);
        if (!payload) continue;
        try {
          const response = await fetch("/api/lctp/answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          });
          if (response.ok) window.localStorage.removeItem(key);
        } catch {
          return;
        }
      }
      setSavingState("saved");
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [exam]);

  const answeredCount = useMemo(
    () => (exam ? exam.questions.filter((q) => answers[String(q.id)] !== undefined).length : 0),
    [exam, answers],
  );

  const clock = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  if (finished) {
    return (
      <div className="card p-8 text-center rise">
        <span
          className="mx-auto grid h-16 w-16 place-items-center rounded-full pop"
          style={{ background: "rgba(96,106,70,0.15)", color: "var(--c-success)" }}
        >
          <Icon name="check" size={32} />
        </span>
        <h2 className="mt-4 text-2xl font-semibold">Jawaban terkirim</h2>
        <p className="mt-1" style={{ color: "var(--c-muted)" }}>
          Menunggu pengumuman panitia. Nilai LCTP akan tampil setelah dirilis.
        </p>
        {error ? (
          <p className="mt-3 text-sm" style={{ color: "var(--c-danger)" }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="space-y-4">
        <div className="card p-6">
          <h2 className="text-2xl font-semibold">Persiapan {contestName}</h2>
          <p className="mt-1" style={{ color: "var(--c-muted)" }}>
            Tim {teamName} · {teamSize} orang per tim
          </p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl p-3" style={{ background: "var(--c-primary-soft)" }}>
              <dt className="text-xs" style={{ color: "var(--c-muted)" }}>
                Jumlah soal
              </dt>
              <dd className="num text-2xl font-semibold">{questionCount}</dd>
            </div>
            <div className="rounded-xl p-3" style={{ background: "var(--c-primary-soft)" }}>
              <dt className="text-xs" style={{ color: "var(--c-muted)" }}>
                Durasi
              </dt>
              <dd className="num text-2xl font-semibold">{durationMin} menit</dd>
            </div>
            <div className="rounded-xl p-3" style={{ background: "var(--c-primary-soft)" }}>
              <dt className="text-xs" style={{ color: "var(--c-muted)" }}>
                Penilaian
              </dt>
              <dd className="text-2xl font-semibold">Otomatis</dd>
            </div>
          </dl>
          <ul className="mt-5 list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--c-muted)" }}>
            <li>Satu soal ditampilkan per layar, jawaban tersimpan otomatis setiap dipilih.</li>
            <li>Waktu dihitung server. Menutup halaman tidak menghentikan waktu.</li>
            <li>Soal dan pilihan jawaban diacak untuk setiap tim.</li>
            <li>Setelah menekan Selesai, jawaban dinilai otomatis dan tidak dapat diubah.</li>
          </ul>

          {ready ? (
            <button type="button" className="btn btn-primary btn-lg mt-6 w-full" onClick={start} disabled={starting}>
              {starting ? "Menyiapkan soal…" : "Mulai mengerjakan"}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-lg mt-6 w-full" onClick={() => setReady(true)}>
              Saya siap
            </button>
          )}

          {error ? (
            <p role="alert" className="mt-3 rounded-xl p-3 text-sm" style={{ background: "rgba(142,47,35,0.1)", color: "var(--c-danger)" }}>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card sticky top-[68px] z-20 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--c-muted)" }}>
            {contestName} · soal {index + 1} dari {exam.questions.length}
          </p>
          <p className="text-sm" style={{ color: "var(--c-muted)" }}>
            {answeredCount} terjawab · {exam.questions.length - answeredCount} belum
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--c-muted)" }}>
            {savingState === "saving" ? "Menyimpan…" : savingState === "offline" ? "Tersimpan di perangkat" : savingState === "saved" ? "Jawaban tersimpan" : ""}
          </span>
          <span
            className="num rounded-xl px-4 py-2 text-2xl font-semibold"
            style={{
              background: remaining < 120 ? "rgba(142,47,35,0.12)" : "var(--c-primary-soft)",
              color: remaining < 120 ? "var(--c-danger)" : "var(--c-text)",
            }}
            aria-label={`Sisa waktu ${clock}`}
          >
            {clock}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="card p-5 sm:p-6" key={question?.id}>
          <p className="text-lg font-semibold sm:text-xl">{question?.text}</p>
          {question?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={question.imageUrl} alt="Gambar soal" className="mt-3 max-h-64 rounded-xl" />
          ) : null}
          <div className="mt-5 space-y-2">
            {question?.options.map((option, optionIndex) => {
              const active = answers[String(question.id)] === optionIndex;
              return (
                <button
                  key={optionIndex}
                  type="button"
                  onClick={() => choose(optionIndex)}
                  aria-pressed={active}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition"
                  style={{
                    borderColor: active ? "var(--c-primary)" : "var(--c-border)",
                    background: active ? "var(--c-primary-soft)" : "var(--c-surface)",
                  }}
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold"
                    style={{
                      background: active ? "var(--c-primary)" : "var(--c-primary-soft)",
                      color: active ? "var(--c-on-primary)" : "var(--c-text)",
                    }}
                  >
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <span>{option}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex justify-between gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              Sebelumnya
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIndex((i) => Math.min(exam.questions.length - 1, i + 1))}
              disabled={index >= exam.questions.length - 1}
            >
              Berikutnya
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="card p-4">
            <p className="mb-2 text-sm font-semibold">Nomor soal</p>
            <div className="grid grid-cols-5 gap-1.5">
              {exam.questions.map((q, questionIndex) => {
                const answered = answers[String(q.id)] !== undefined;
                const current = questionIndex === index;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setIndex(questionIndex)}
                    aria-label={`Soal ${questionIndex + 1}${answered ? ", terjawab" : ", belum dijawab"}`}
                    className="num grid h-10 place-items-center rounded-lg border text-sm font-semibold"
                    style={{
                      borderColor: current ? "var(--c-primary)" : "var(--c-border)",
                      background: answered ? "var(--c-primary)" : "var(--c-surface)",
                      color: answered ? "var(--c-on-primary)" : "var(--c-text)",
                    }}
                  >
                    {questionIndex + 1}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={() => setConfirmFinish(true)}
            disabled={submitting}
          >
            Selesai
          </button>
          <p className="text-xs" style={{ color: "var(--c-muted)" }}>
            Ujian tidak dapat dilanjutkan setelah selesai atau waktu habis.
          </p>
        </div>
      </div>

      {confirmFinish ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ background: "rgba(55,31,23,0.55)" }}
        >
          <div className="card w-full max-w-md p-6">
            <h2 className="text-2xl font-semibold">Selesaikan ujian?</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--c-muted)" }}>
              {answeredCount} dari {exam.questions.length} soal terjawab. Jawaban akan dikirim dan dinilai otomatis.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmFinish(false)}>
                Kembali
              </button>
              <button type="button" className="btn btn-primary" onClick={() => finish(false)} disabled={submitting}>
                {submitting ? "Mengirim…" : "Ya, selesai"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
