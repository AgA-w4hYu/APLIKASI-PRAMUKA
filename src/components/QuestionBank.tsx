"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui";

export interface BankQuestion {
  id: number;
  text: string;
  options: string[];
  answerIndex: number;
  score: number;
  difficulty: string;
  packageName: string;
}

const EMPTY = {
  text: "",
  options: ["", "", "", ""],
  answerIndex: 0,
  score: 10,
  difficulty: "sedang",
  packageName: "Paket A",
};

export function QuestionBank({ contestId, questions }: { contestId: number; questions: BankQuestion[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY, options: [...EMPTY.options] });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setForm({ ...EMPTY, options: [...EMPTY.options] });
    setEditingId(null);
  }

  function edit(question: BankQuestion) {
    setEditingId(question.id);
    setForm({
      text: question.text,
      options: [...question.options],
      answerIndex: question.answerIndex,
      score: question.score,
      difficulty: question.difficulty,
      packageName: question.packageName,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function send(action: "create" | "update" | "delete", id?: number) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestId,
          action,
          question:
            action === "delete"
              ? { id }
              : {
                  id,
                  text: form.text,
                  options: form.options.filter((o) => o.trim() !== ""),
                  answerIndex: form.answerIndex,
                  score: Number(form.score),
                  difficulty: form.difficulty,
                  packageName: form.packageName,
                },
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Soal tidak dapat disimpan.");
        return;
      }
      reset();
      router.refresh();
    } catch {
      setError("Koneksi terputus. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{editingId ? `Ubah soal #${editingId}` : "Tambah soal baru"}</h2>
          {editingId ? (
            <button type="button" className="link text-sm" onClick={reset}>
              Batalkan perubahan
            </button>
          ) : null}
        </div>

        <label htmlFor="q-text" className="label mt-3">
          Pertanyaan
        </label>
        <textarea
          id="q-text"
          className="input"
          rows={2}
          value={form.text}
          onChange={(e) => setForm((prev) => ({ ...prev, text: e.target.value }))}
          placeholder="Tingkatan Pramuka Penggalang secara berurutan adalah …"
        />

        <p className="label mt-3">Pilihan jawaban (tandai kunci jawaban)</p>
        <div className="space-y-2">
          {form.options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="radio"
                name="answer"
                checked={form.answerIndex === index}
                onChange={() => setForm((prev) => ({ ...prev, answerIndex: index }))}
                aria-label={`Jadikan pilihan ${String.fromCharCode(65 + index)} sebagai kunci jawaban`}
                className="h-5 w-5"
              />
              <input
                className="input !py-2"
                value={option}
                aria-label={`Pilihan ${String.fromCharCode(65 + index)}`}
                placeholder={`Pilihan ${String.fromCharCode(65 + index)}`}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    options: prev.options.map((o, i) => (i === index ? e.target.value : o)),
                  }))
                }
              />
              {form.options.length > 2 ? (
                <button
                  type="button"
                  className="btn btn-ghost px-2"
                  aria-label={`Hapus pilihan ${String.fromCharCode(65 + index)}`}
                  onClick={() =>
                    setForm((prev) => {
                      const options = prev.options.filter((_, i) => i !== index);
                      return {
                        ...prev,
                        options,
                        answerIndex: Math.min(prev.answerIndex, options.length - 1),
                      };
                    })
                  }
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() => setForm((prev) => ({ ...prev, options: [...prev.options, ""] }))}
            disabled={form.options.length >= 6}
          >
            <Icon name="plus" size={16} /> Tambah pilihan
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="q-score" className="label">
              Skor
            </label>
            <input
              id="q-score"
              type="number"
              min={1}
              className="input num"
              value={form.score}
              onChange={(e) => setForm((prev) => ({ ...prev, score: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label htmlFor="q-diff" className="label">
              Tingkat kesulitan
            </label>
            <select
              id="q-diff"
              className="input"
              value={form.difficulty}
              onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value }))}
            >
              <option value="mudah">Mudah</option>
              <option value="sedang">Sedang</option>
              <option value="sulit">Sulit</option>
            </select>
          </div>
          <div>
            <label htmlFor="q-package" className="label">
              Paket soal
            </label>
            <input
              id="q-package"
              className="input"
              value={form.packageName}
              onChange={(e) => setForm((prev) => ({ ...prev, packageName: e.target.value }))}
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm" style={{ color: "var(--c-danger)" }}>
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {editingId ? (
            <button type="button" className="btn btn-primary" onClick={() => send("update", editingId)} disabled={busy}>
              Simpan perubahan
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => send("create")} disabled={busy}>
              <Icon name="plus" size={16} /> Tambah soal
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="border-b p-5" style={{ borderColor: "var(--c-border)" }}>
          <h2 className="text-lg font-semibold">{questions.length} soal di bank soal</h2>
          <p className="text-sm" style={{ color: "var(--c-muted)" }}>
            Kunci jawaban hanya terlihat di halaman ini, tidak pernah dikirim ke peserta.
          </p>
        </div>
        <ol className="divide-y" style={{ borderColor: "var(--c-border)" }}>
          {questions.map((question, index) => (
            <li key={question.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="num mr-2" style={{ color: "var(--c-muted)" }}>
                      {index + 1}.
                    </span>
                    {question.text}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {question.options.map((option, optionIndex) => (
                      <li
                        key={optionIndex}
                        style={{
                          color:
                            optionIndex === question.answerIndex ? "var(--c-success)" : "var(--c-muted)",
                          fontWeight: optionIndex === question.answerIndex ? 600 : 400,
                        }}
                      >
                        {String.fromCharCode(65 + optionIndex)}. {option}
                        {optionIndex === question.answerIndex ? " ✓ kunci" : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs" style={{ color: "var(--c-muted)" }}>
                    Skor {question.score} · {question.difficulty} · {question.packageName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary text-sm" onClick={() => edit(question)}>
                    Ubah
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost text-sm"
                    style={{ color: "var(--c-danger)" }}
                    onClick={() => send("delete", question.id)}
                    disabled={busy}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </li>
          ))}
          {questions.length === 0 ? (
            <li className="p-5 text-sm" style={{ color: "var(--c-muted)" }}>
              Bank soal masih kosong. Tambahkan soal pertama di atas.
            </li>
          ) : null}
        </ol>
      </div>
    </div>
  );
}
