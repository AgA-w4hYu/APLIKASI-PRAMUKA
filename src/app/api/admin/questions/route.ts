import { NextResponse } from "next/server";
import { ApiError, readJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { getContest } from "@/lib/services/contests";

interface QuestionInput {
  id?: number;
  text?: string;
  options?: string[];
  answerIndex?: number;
  score?: number;
  difficulty?: string;
  packageName?: string;
  imageUrl?: string;
}

export const POST = route(async (req: Request) => {
  const admin = await requirePermission("soal.ubah");
  const body = await readJson<{ contestId?: number; action?: string; question?: QuestionInput }>(req);
  if (!body.contestId) throw new ApiError("Lomba wajib dipilih.");
  const contest = getContest(Number(body.contestId));
  if (contest.type !== "lctp") throw new ApiError("Bank soal hanya untuk lomba ujian.");
  const db = getDb();

  if (body.action === "delete") {
    const id = Number(body.question?.id);
    if (!id) throw new ApiError("Soal tidak dikenal.");
    db.prepare("DELETE FROM questions WHERE id = ? AND contest_id = ?").run(id, contest.id);
    appendAudit({ id: admin.id, name: admin.name }, "soal.hapus", "question", id, { contest: contest.name });
    return NextResponse.json({ ok: true });
  }

  const question = body.question ?? {};
  const text = (question.text ?? "").trim();
  const options = (question.options ?? []).map((o) => String(o).trim());
  const answerIndex = Number(question.answerIndex);
  if (text.length < 3) throw new ApiError("Pertanyaan wajib diisi.");
  if (options.length < 2 || options.some((o) => !o)) throw new ApiError("Isi minimal dua pilihan jawaban.");
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
    throw new ApiError("Pilih kunci jawaban yang benar.");
  }
  const score = Number(question.score) > 0 ? Number(question.score) : 10;
  const difficulty = ["mudah", "sedang", "sulit"].includes(question.difficulty ?? "")
    ? question.difficulty!
    : "sedang";

  if (body.action === "update" && question.id) {
    db.prepare(
      `UPDATE questions SET text = ?, options = ?, answer_index = ?, score = ?, difficulty = ?, package_name = ?, image_url = ?
       WHERE id = ? AND contest_id = ?`,
    ).run(
      text,
      JSON.stringify(options),
      answerIndex,
      score,
      difficulty,
      question.packageName || "Paket A",
      question.imageUrl?.trim() || null,
      Number(question.id),
      contest.id,
    );
    appendAudit({ id: admin.id, name: admin.name }, "soal.ubah", "question", Number(question.id), {
      contest: contest.name,
      text,
    });
    return NextResponse.json({ ok: true, id: Number(question.id) });
  }

  const maxOrder = (
    db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS n FROM questions WHERE contest_id = ?").get(contest.id) as {
      n: number;
    }
  ).n;
  const info = db
    .prepare(
      `INSERT INTO questions (contest_id, text, image_url, options, answer_index, score, difficulty, package_name, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      contest.id,
      text,
      question.imageUrl?.trim() || null,
      JSON.stringify(options),
      answerIndex,
      score,
      difficulty,
      question.packageName || "Paket A",
      maxOrder + 1,
    );
  appendAudit({ id: admin.id, name: admin.name }, "soal.tambah", "question", Number(info.lastInsertRowid), {
    contest: contest.name,
    text,
  });
  return NextResponse.json({ ok: true, id: Number(info.lastInsertRowid) });
});
