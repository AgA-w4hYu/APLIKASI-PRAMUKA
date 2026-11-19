export interface ScoreItem {
  id: number;
  section_id: number;
  name: string;
  hint: string | null;
  max_value: number;
  weight: number;
  input_type: string;
  sort_order: number;
}

export interface ScorePenalty {
  id: number;
  name: string;
  value: number;
}

export type Values = Record<string, number>;

export interface ScoreResult {
  total: number;
  rawTotal: number;
  maxTotal: number;
  penaltyTotal: number;
  breakdown: Values;
  penaltyIds: number[];
}

export function effectiveMax(item: ScoreItem): number {
  return item.max_value * (item.weight || 1);
}

/**
 * Total dinormalkan ke skala 100: sum(nilai x bobot) / sum(maks x bobot) x 100,
 * lalu penalti dikurangkan dan hasilnya dibatasi 0..100.
 */
export function computeScore(
  items: ScoreItem[],
  values: Values,
  penalties: ScorePenalty[],
  selectedPenaltyIds: number[],
): ScoreResult {
  let rawTotal = 0;
  let maxTotal = 0;
  const breakdown: Values = {};
  for (const item of items) {
    const raw = Number(values[String(item.id)] ?? 0);
    const value = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), item.max_value) : 0;
    breakdown[String(item.id)] = value;
    rawTotal += value * (item.weight || 1);
    maxTotal += effectiveMax(item);
  }
  const penaltyTotal = penalties
    .filter((p) => selectedPenaltyIds.includes(p.id))
    .reduce((sum, p) => sum + Math.abs(p.value), 0);
  const normalized = maxTotal > 0 ? (rawTotal / maxTotal) * 100 : 0;
  const total = Math.min(100, Math.max(0, normalized - penaltyTotal));
  return {
    total: Math.round(total * 100) / 100,
    rawTotal: Math.round(rawTotal * 100) / 100,
    maxTotal: Math.round(maxTotal * 100) / 100,
    penaltyTotal,
    breakdown,
    penaltyIds: selectedPenaltyIds,
  };
}

export function validateValues(items: ScoreItem[], values: Values): string[] {
  const errors: string[] = [];
  for (const item of items) {
    const key = String(item.id);
    const raw = values[key];
    if (raw === undefined || raw === null) {
      errors.push(`Nilai "${item.name}" belum diisi.`);
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      errors.push(`Nilai "${item.name}" harus berupa angka.`);
    } else if (n < 0 || n > item.max_value) {
      errors.push(`Nilai "${item.name}" harus antara 0 dan ${item.max_value}.`);
    }
  }
  return errors;
}

export function validatePenalties(penalties: ScorePenalty[], ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  const allowed = new Set(penalties.map((p) => p.id));
  return ids.map((v) => Number(v)).filter((v) => allowed.has(v));
}
