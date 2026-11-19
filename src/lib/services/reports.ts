import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { getDb, getSetting } from "@/lib/db";
import { CATEGORIES, categoryLabel, categoryColor } from "@/lib/constants";
import { listContests } from "@/lib/services/contests";
import { standings } from "@/lib/services/leaderboard";

const INK = "371F17";
const MUTED = "6B5B50";
const ACCENT = "936538";

interface DetailRow {
  contest: string;
  category: string;
  team: string;
  npp: string;
  rank: number | null;
  score: number | null;
  judges: { name: string; total: number }[];
}

interface DetailItemRow {
  contest: string;
  category: string;
  team: string;
  juri: string;
  item: string;
  value: number;
  max: number;
}

export interface ReportScope {
  contestId?: number;
  category?: string;
}

function scopedContests(scope: ReportScope) {
  return listContests().filter((c) => !scope.contestId || c.id === scope.contestId);
}

function scopedCategories(scope: ReportScope) {
  return CATEGORIES.filter((c) => !scope.category || c.key === scope.category);
}

function collect(scope: ReportScope): { summary: DetailRow[]; items: DetailItemRow[] } {
  const db = getDb();
  const summary: DetailRow[] = [];
  const items: DetailItemRow[] = [];
  for (const contest of scopedContests(scope)) {
    const rows = standings(contest.id);
    for (const category of scopedCategories(scope)) {
      const catRows = rows.filter((r) => r.category === category.key && r.score !== null);
      for (const row of catRows) {
        const judgeRows = db
          .prepare(
            `SELECT u.name AS name, s.total AS total FROM scores s LEFT JOIN users u ON u.id = s.juri_id
             WHERE s.contest_id = ? AND s.team_id = ? AND s.status IN ('terkirim','dikoreksi','dirilis')
             ORDER BY u.name ASC`,
          )
          .all(contest.id, row.teamId) as { name: string | null; total: number }[];
        summary.push({
          contest: contest.name,
          category: categoryLabel(category.key),
          team: row.name,
          npp: row.npp,
          rank: row.rank,
          score: row.score,
          judges: judgeRows.map((j) => ({ name: j.name ?? "Ujian LCTP", total: j.total })),
        });

        const scoreRows = db
          .prepare(
            `SELECT s.id, s.sheet_id, s.breakdown, u.name AS juri_name FROM scores s
             LEFT JOIN users u ON u.id = s.juri_id
             WHERE s.contest_id = ? AND s.team_id = ? AND s.status IN ('terkirim','dikoreksi','dirilis')`,
          )
          .all(contest.id, row.teamId) as {
          id: number;
          sheet_id: number | null;
          breakdown: string;
          juri_name: string | null;
        }[];
        for (const sr of scoreRows) {
          if (!sr.sheet_id) continue;
          const breakdown = JSON.parse(sr.breakdown) as Record<string, number>;
          const sheetItems = db
            .prepare(
              "SELECT id, name, max_value FROM sheet_items WHERE sheet_id = ? ORDER BY sort_order ASC, id ASC",
            )
            .all(sr.sheet_id) as { id: number; name: string; max_value: number }[];
          for (const item of sheetItems) {
            items.push({
              contest: contest.name,
              category: categoryLabel(category.key),
              team: row.name,
              juri: sr.juri_name ?? "Sistem",
              item: item.name,
              value: breakdown[String(item.id)] ?? 0,
              max: item.max_value,
            });
          }
        }
      }
    }
  }
  return { summary, items };
}

interface SignedRow {
  contest: string;
  category: string;
  team: string;
  npp: string;
  juri: string;
  total: number;
  signedAt: string;
  code: string;
  image: string;
}

async function collectSignatures(scope: ReportScope): Promise<SignedRow[]> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.name AS contest, t.name AS team, t.npp, t.category, COALESCE(u.name, 'Sistem') AS juri,
              s.total, s.submitted_at, sig.signed_at, sig.verification_code AS code, sig.image
       FROM scores s
       JOIN signatures sig ON sig.score_id = s.id
       JOIN contests c ON c.id = s.contest_id
       JOIN teams t ON t.id = s.team_id
       LEFT JOIN users u ON u.id = s.juri_id
       WHERE s.status IN ('terkirim','dikoreksi','dirilis')
       ORDER BY c.sort_order ASC, t.category ASC, t.name ASC, u.name ASC`,
    )
    .all() as {
    contest: string;
    team: string;
    npp: string;
    category: string;
    juri: string;
    total: number;
    submitted_at: string | null;
    signed_at: string;
    code: string;
    image: string;
  }[];
  return rows
    .filter((row) => !scope.contestId || scopedContests(scope).some((c) => c.name === row.contest))
    .filter((row) => !scope.category || row.category === scope.category)
    .map((row) => ({
      contest: row.contest,
      category: categoryLabel(row.category),
      team: row.team,
      npp: row.npp,
      juri: row.juri,
      total: row.total,
      signedAt: row.signed_at,
      code: row.code,
      image: row.image,
    }));
}

function imageBuffer(dataUrl: string): Buffer | null {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

function text(value: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text: value,
    bold: opts.bold,
    size: opts.size ?? 22,
    color: opts.color ?? INK,
    font: "Plus Jakarta Sans",
  });
}

function cell(value: string, header = false): TableCell {
  return new TableCell({
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    shading: header ? { fill: "EFE6D8" } : undefined,
    children: [
      new Paragraph({
        children: [text(value, { bold: header, size: 20, color: header ? INK : MUTED })],
      }),
    ],
  });
}

function table(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "DED3BF" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "DED3BF" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "DED3BF" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "DED3BF" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "DED3BF" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "DED3BF" },
    },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h) => cell(h, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
    ],
  });
}

export async function buildDocx(scope: ReportScope): Promise<Buffer> {
  const eventName = getSetting("event_name", "ABRAKADABRA 9");
  const eventVenue = getSetting("event_venue", "");
  const eventYear = getSetting("event_year", String(new Date().getFullYear()));
  const school = getSetting("school", "SMK Telkom 1 Medan");
  const { summary, items } = collect(scope);
  const signatures = await collectSignatures(scope);

  const children: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { before: 2400 }, children: [text(school.toUpperCase(), { size: 24, color: ACCENT, bold: true })] }),
    new Paragraph({
      spacing: { before: 200, after: 120 },
      children: [new TextRun({ text: eventName, bold: true, size: 96, color: INK, font: "Fraunces" })],
    }),
    new Paragraph({ children: [text("Laporan Hasil Penilaian Lomba Pramuka", { size: 32, color: MUTED })] }),
    new Paragraph({ spacing: { before: 360 }, children: [text(eventVenue, { size: 24, color: MUTED })] }),
    new Paragraph({ children: [text(`Tahun ${eventYear}`, { size: 24, color: MUTED })] }),
    new Paragraph({
      spacing: { before: 1200 },
      children: [
        text(
          `Dibuat ${new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}`,
          { size: 18, color: MUTED },
        ),
      ],
    }),
    new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Ringkasan Juara", font: "Fraunces", size: 36, color: INK })] }),
    new Paragraph({ spacing: { after: 200 }, children: [text("Peringkat dihitung dari rata-rata nilai juri pada tiap lomba.", { color: MUTED })] }),
  ];

  for (const contest of scopedContests(scope)) {
    const rows = summary
      .filter((r) => r.contest === contest.name)
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const winners = new Map<string, DetailRow>();
    for (const row of rows) {
      if (row.rank && row.rank <= 3 && !winners.has(`${row.category}-${row.rank}`)) {
        winners.set(`${row.category}-${row.rank}`, row);
      }
    }
    const winnerRows = CATEGORIES.filter((c) => !scope.category || c.key === scope.category).map((c) => {
      const label = categoryLabel(c.key);
      const first = winners.get(`${label}-1`);
      const second = winners.get(`${label}-2`);
      const third = winners.get(`${label}-3`);
      return [label, first?.team ?? "—", second?.team ?? "—", third?.team ?? "—"];
    });
    children.push(
      new Paragraph({ spacing: { before: 240, after: 120 }, children: [text(contest.name.toUpperCase(), { bold: true, color: ACCENT })] }),
      table(["Kategori", "Juara 1", "Juara 2", "Juara 3"], winnerRows),
    );

    if (rows.length > 0) {
      children.push(
        new Paragraph({ spacing: { before: 240, after: 120 }, children: [text(`Rekap Nilai ${contest.name}`, { bold: true })] }),
        table(
          ["Peringkat", "Tim", "NPP", "Kategori", "Nilai"],
          rows.map((r) => [String(r.rank ?? "—"), r.team, r.npp, r.category, (r.score ?? 0).toFixed(2)]),
        ),
        new Paragraph({ spacing: { before: 120, after: 120 }, children: [text(`Rincian kriteria ${contest.name}`, { bold: true })] }),
        table(
          ["Tim", "Juri", "Kriteria", "Nilai", "Maks"],
          items
            .filter((i) => i.contest === contest.name && rows.some((r) => r.team === i.team))
            .map((i) => [i.team, i.juri, i.item, i.value.toFixed(2), i.max.toFixed(0)]),
        ),
      );
    }

    const signed = signatures.filter((row) => row.contest === contest.name);
    if (signed.length > 0) {
      const appUrl = process.env.APP_ORIGIN ?? "http://localhost:3100";
      const signatureRows: TableRow[] = [];
      for (const row of signed) {
        const buffer = imageBuffer(row.image);
        const qr = imageBuffer(
          await QRCode.toDataURL(`${appUrl}/verifikasi/${row.code}`, { margin: 0, width: 160 }),
        );
        signatureRows.push(
          new TableRow({
            children: [
              cell(`${row.team}\n${row.npp}`),
              cell(row.juri),
              cell(row.total.toFixed(2)),
              cell(new Date(row.signedAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })),
              new TableCell({
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [
                  new Paragraph({ children: [text(row.code, { bold: true, size: 16 })] }),
                  ...(qr
                    ? [
                        new Paragraph({
                          children: [
                            new ImageRun({ data: qr, transformation: { width: 64, height: 64 }, type: "png" }),
                          ],
                        }),
                      ]
                    : []),
                ],
              }),
              new TableCell({
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: buffer
                  ? [
                      new Paragraph({
                        children: [
                          new ImageRun({ data: buffer, transformation: { width: 110, height: 44 }, type: "png" }),
                        ],
                      }),
                    ]
                  : [new Paragraph({ children: [text("—")] })],
              }),
            ],
          }),
        );
      }
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [text(`Lembar nilai dan tanda tangan ${contest.name}`, { bold: true })],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: "DED3BF" },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: "DED3BF" },
            left: { style: BorderStyle.SINGLE, size: 2, color: "DED3BF" },
            right: { style: BorderStyle.SINGLE, size: 2, color: "DED3BF" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "DED3BF" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "DED3BF" },
          },
          rows: [
            new TableRow({
              tableHeader: true,
              children: ["Tim", "Juri", "Total", "Ditandatangani", "Kode / QR verifikasi", "Tanda tangan"].map(
                (header) => cell(header, true),
              ),
            }),
            ...signatureRows,
          ],
        }),
        new Paragraph({
          spacing: { before: 80 },
          children: [
            text("Pindai kode QR untuk memeriksa apakah hash lembar masih cocok dengan data sistem.", {
              size: 16,
              color: MUTED,
            }),
          ],
        }),
      );
    }
  }

  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Pengesahan", font: "Fraunces", size: 36, color: INK })] }),
    new Paragraph({
      spacing: { before: 240, after: 480 },
      children: [text(`Medan, ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })}`, { color: MUTED })],
    }),
    table(
      ["Jabatan", "Nama", "Tanda Tangan"],
      [
        ["Ketua Panitia", "…………………………………", ""],
        ["Koordinator Juri", "…………………………………", ""],
        ["Kepala Sekolah", "…………………………………", ""],
      ],
    ),
  );

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Plus Jakarta Sans", size: 22, color: INK } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [text(`${eventName} • ${school}`, { size: 16, color: MUTED })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export function buildXlsx(scope: ReportScope): Buffer {
  const { summary, items } = collect(scope);
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet(
    summary.map((r) => ({
      Lomba: r.contest,
      Kategori: r.category,
      Peringkat: r.rank ?? "",
      Tim: r.team,
      NPP: r.npp,
      Nilai: r.score === null ? "" : Math.round(r.score * 100) / 100,
      JumlahJuri: r.judges.length,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Rekap Nilai");

  const detailSheet = XLSX.utils.json_to_sheet(
    items.map((i) => ({
      Lomba: i.contest,
      Kategori: i.category,
      Tim: i.team,
      Juri: i.juri,
      Kriteria: i.item,
      Nilai: i.value,
      Maksimum: i.max,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Rincian Kriteria");

  const db = getDb();
  const lctp = listContests().find((c) => c.type === "lctp");
  if (lctp) {
    const examRows = db
      .prepare(
        `SELECT t.name AS Tim, t.npp AS NPP, es.score AS Nilai, es.status AS Status, es.submitted_at AS Dikumpulkan
         FROM exam_sessions es JOIN teams t ON t.id = es.team_id WHERE es.contest_id = ? ORDER BY es.score DESC`,
      )
      .all(lctp.id);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(examRows), "Ujian LCTP");
  }

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function reportFilename(extension: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `laporan-abrakadabra-9-${stamp}.${extension}`;
}

export function categoryAccent(key: string): string {
  return categoryColor(key);
}
