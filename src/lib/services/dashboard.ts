import { getDb } from "@/lib/db";
import { CATEGORIES } from "@/lib/constants";
import { listContests } from "@/lib/services/contests";

export interface DashboardData {
  generatedAt: string;
  counts: { teams: number; users: number; juri: number; submitted: number; locked: number };
  teamsByCategory: { category: string; label: string; count: number }[];
  contests: {
    id: number;
    name: string;
    type: string;
    status: string;
    done: number;
    total: number;
    juriCount: number;
    released: string[];
  }[];
  juri: {
    name: string;
    contest: string;
    done: number;
    total: number;
    state: "belum" | "sebagian" | "selesai";
  }[];
  lctp: { berjalan: number; selesai: number; totalQuestions: number; top: { team: string; score: number }[] };
  warnings: { kind: string; message: string }[];
}

export function dashboardData(): DashboardData {
  const db = getDb();
  const contests = listContests();
  const totalTeams = (db.prepare("SELECT COUNT(*) AS n FROM teams").get() as { n: number }).n;
  const submitted = (
    db.prepare("SELECT COUNT(*) AS n FROM scores WHERE status IN ('terkirim','dikoreksi','dirilis')").get() as {
      n: number;
    }
  ).n;
  const locked = (db.prepare("SELECT COUNT(*) AS n FROM scores WHERE status != 'draf'").get() as { n: number }).n;

  const teamsByCategory = CATEGORIES.map((c) => ({
    category: c.key,
    label: c.label,
    count: (
      db.prepare("SELECT COUNT(*) AS n FROM teams WHERE category = ?").get(c.key) as { n: number }
    ).n,
  }));

  const contestRows = contests.map((contest) => {
    const juriCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM assignments a WHERE a.contest_id = ?")
        .get(contest.id) as { n: number }
    ).n;
    const done =
      contest.type === "lctp"
        ? (db.prepare("SELECT COUNT(*) AS n FROM exam_sessions WHERE contest_id = ? AND status = 'selesai'").get(contest.id) as { n: number }).n
        : (db
            .prepare(
              "SELECT COUNT(*) AS n FROM scores WHERE contest_id = ? AND status IN ('terkirim','dikoreksi','dirilis')",
            )
            .get(contest.id) as { n: number }).n;
    const released = (
      db.prepare("SELECT category FROM releases WHERE contest_id = ?").all(contest.id) as { category: string }[]
    ).map((r) => r.category);
    return {
      id: contest.id,
      name: contest.name,
      type: contest.type,
      status: contest.status,
      done,
      total: contest.type === "lctp" ? totalTeams : totalTeams * Math.max(juriCount, 1),
      juriCount,
      released,
    };
  });

  const juriRows = db
    .prepare(
      `SELECT u.name, c.name AS contest, c.id AS contest_id, u.id AS juri_id
       FROM assignments a JOIN users u ON u.id = a.juri_id JOIN contests c ON c.id = a.contest_id
       WHERE u.active = 1 ORDER BY c.sort_order ASC, u.name ASC`,
    )
    .all() as { name: string; contest: string; contest_id: number; juri_id: number }[];
  const juri = juriRows.map((row) => {
    const done = (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM scores WHERE contest_id = ? AND juri_id = ? AND status IN ('terkirim','dikoreksi','dirilis')",
        )
        .get(row.contest_id, row.juri_id) as { n: number }
    ).n;
    const drafts = (
      db
        .prepare("SELECT COUNT(*) AS n FROM scores WHERE contest_id = ? AND juri_id = ? AND status = 'draf'")
        .get(row.contest_id, row.juri_id) as { n: number }
    ).n;
    return {
      name: row.name,
      contest: row.contest,
      done,
      total: totalTeams,
      state: done >= totalTeams ? ("selesai" as const) : done === 0 && drafts === 0 ? ("belum" as const) : ("sebagian" as const),
    };
  });

  const lctpContest = contests.find((c) => c.type === "lctp");
  const lctp = lctpContest
    ? {
        berjalan: (
          db
            .prepare("SELECT COUNT(*) AS n FROM exam_sessions WHERE contest_id = ? AND status = 'berjalan'")
            .get(lctpContest.id) as { n: number }
        ).n,
        selesai: (
          db
            .prepare("SELECT COUNT(*) AS n FROM exam_sessions WHERE contest_id = ? AND status = 'selesai'")
            .get(lctpContest.id) as { n: number }
        ).n,
        totalQuestions: (
          db.prepare("SELECT COUNT(*) AS n FROM questions WHERE contest_id = ?").get(lctpContest.id) as { n: number }
        ).n,
        top: db
          .prepare(
            `SELECT t.name AS team, es.score FROM exam_sessions es JOIN teams t ON t.id = es.team_id
             WHERE es.contest_id = ? AND es.status = 'selesai' ORDER BY es.score DESC LIMIT 5`,
          )
          .all(lctpContest.id) as { team: string; score: number }[],
      }
    : { berjalan: 0, selesai: 0, totalQuestions: 0, top: [] };

  const warnings: { kind: string; message: string }[] = [];
  for (const contest of contests.filter((c) => c.status === "berjalan" && c.type === "juri")) {
    const scoredTeams = (
      db
        .prepare("SELECT COUNT(DISTINCT team_id) AS n FROM scores WHERE contest_id = ? AND status != 'draf'")
        .get(contest.id) as { n: number }
    ).n;
    if (scoredTeams < totalTeams) {
      warnings.push({
        kind: "tim-belly",
        message: `${contest.name}: ${totalTeams - scoredTeams} tim belum punya nilai terkirim.`,
      });
    }
  }
  const pending = (
    db.prepare("SELECT COUNT(*) AS n FROM correction_requests WHERE status = 'menunggu'").get() as { n: number }
  ).n;
  if (pending > 0) warnings.push({ kind: "koreksi", message: `${pending} permintaan koreksi menunggu keputusan.` });
  const unreleased = contestRows.filter((c) => c.done > 0 && c.released.length === 0);
  if (unreleased.length > 0) {
    warnings.push({
      kind: "rilis",
      message: `Nilai ${unreleased.map((c) => c.name).join(", ")} belum dirilis ke peserta.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      teams: totalTeams,
      users: (db.prepare("SELECT COUNT(*) AS n FROM users WHERE active = 1").get() as { n: number }).n,
      juri: (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'juri' AND active = 1").get() as { n: number }).n,
      submitted,
      locked,
    },
    teamsByCategory,
    contests: contestRows,
    juri,
    lctp,
    warnings,
  };
}
