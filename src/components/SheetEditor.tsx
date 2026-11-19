"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui";

interface Item {
  key: string;
  name: string;
  hint: string;
  max: number;
  weight: number;
}

interface Section {
  key: string;
  name: string;
  items: Item[];
}

interface Penalty {
  key: string;
  name: string;
  value: number;
}

let counter = 0;
const nextKey = () => `k${Date.now()}-${counter++}`;

export function SheetEditor({
  contestId,
  initialSections,
  initialPenalties,
  version,
  hasScores,
  locked,
}: {
  contestId: number;
  initialSections: Section[];
  initialPenalties: Penalty[];
  version: number;
  hasScores: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>(
    initialSections.length > 0
      ? initialSections
      : [{ key: nextKey(), name: "Kriteria Utama", items: [{ key: nextKey(), name: "", hint: "", max: 25, weight: 1 }] }],
  );
  const [penalties, setPenalties] = useState<Penalty[]>(initialPenalties);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const total = sections.reduce(
    (sum, section) => sum + section.items.reduce((s, item) => s + (Number(item.max) || 0) * (Number(item.weight) || 1), 0),
    0,
  );

  function updateSection(index: number, name: string) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, name } : s)));
  }

  function updateItem(sectionIndex: number, itemIndex: number, patch: Partial<Item>) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? { ...s, items: s.items.map((item, j) => (j === itemIndex ? { ...item, ...patch } : item)) }
          : s,
      ),
    );
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      { key: nextKey(), name: "Kategori baru", items: [{ key: nextKey(), name: "", hint: "", max: 20, weight: 1 }] },
    ]);
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem(sectionIndex: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex
          ? { ...s, items: [...s.items, { key: nextKey(), name: "", hint: "", max: 10, weight: 1 }] }
          : s,
      ),
    );
  }

  function removeItem(sectionIndex: number, itemIndex: number) {
    setSections((prev) =>
      prev.map((s, i) => (i === sectionIndex ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) } : s)),
    );
  }

  function addPenalty() {
    setPenalties((prev) => [...prev, { key: nextKey(), name: "", value: 5 }]);
  }

  async function save(lock: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contestId,
          lock,
          payload: {
            sections: sections.map((s) => ({
              name: s.name,
              items: s.items.map((item) => ({
                name: item.name,
                hint: item.hint,
                max: Number(item.max),
                weight: Number(item.weight),
                type: "angka",
              })),
            })),
            penalties: penalties
              .filter((p) => p.name.trim())
              .map((p) => ({ name: p.name, value: Number(p.value) })),
          },
        }),
      });
      const data = (await response.json()) as { error?: string; version?: number; newVersion?: boolean };
      if (!response.ok) {
        setMessage({ tone: "error", text: data.error ?? "Lembar tidak dapat disimpan." });
        return;
      }
      setMessage({
        tone: "ok",
        text: data.newVersion
          ? `Lembar versi ${data.version} dibuat. Nilai lama tetap tersimpan pada versi sebelumnya.`
          : `Lembar versi ${data.version} tersimpan.`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Koneksi terputus. Coba simpan lagi." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm" style={{ color: "var(--c-muted)" }}>
            Versi {version} · {sections.reduce((n, s) => n + s.items.length, 0)} kriteria · total maksimum{" "}
            <span className="num font-semibold">{total}</span>
          </p>
          {hasScores ? (
            <p className="mt-1 text-xs" style={{ color: "var(--c-accent)" }}>
              Sudah ada nilai masuk. Menyimpan akan membuat versi baru; nilai lama tidak tertimpa.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary text-sm" onClick={() => setPreview((p) => !p)}>
            {preview ? "Tutup pratinjau" : "Pratinjau juri"}
          </button>
          <button type="button" className="btn btn-secondary text-sm" onClick={() => save(false)} disabled={saving}>
            Simpan lembar
          </button>
          <button type="button" className="btn btn-primary text-sm" onClick={() => save(true)} disabled={saving}>
            <Icon name="shield" size={16} /> {locked ? "Simpan & kunci" : "Kunci versi"}
          </button>
        </div>
      </div>

      {message ? (
        <p
          role="status"
          className="rounded-xl p-3 text-sm"
          style={
            message.tone === "ok"
              ? { background: "rgba(96,106,70,0.12)", color: "var(--c-success)" }
              : { background: "rgba(142,47,35,0.1)", color: "var(--c-danger)" }
          }
        >
          {message.text}
        </p>
      ) : null}

      {preview ? (
        <div className="card p-5">
          <h3 className="text-lg font-semibold">Pratinjau tampilan juri</h3>
          <div className="mt-3 space-y-4">
            {sections.map((section) => (
              <div key={section.key} className="rounded-xl border p-4" style={{ borderColor: "var(--c-border)" }}>
                <p className="font-semibold">{section.name || "(tanpa nama)"}</p>
                <div className="mt-2 space-y-2">
                  {section.items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        {item.name || "(kriteria baru)"}
                        {item.hint ? (
                          <span className="block text-xs" style={{ color: "var(--c-muted)" }}>
                            {item.hint}
                          </span>
                        ) : null}
                      </span>
                      <span className="num rounded-lg px-3 py-1" style={{ background: "var(--c-primary-soft)" }}>
                        0 / {item.max}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {sections.map((section, sectionIndex) => (
        <div key={section.key} className="card p-5">
          <div className="flex items-center gap-3">
            <input
              aria-label="Nama kategori penilaian"
              className="input font-semibold"
              value={section.name}
              onChange={(e) => updateSection(sectionIndex, e.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost text-sm"
              onClick={() => removeSection(sectionIndex)}
              aria-label="Hapus kategori"
            >
              Hapus
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {section.items.map((item, itemIndex) => (
              <div key={item.key} className="grid gap-2 rounded-xl p-3 sm:grid-cols-[1.4fr_1.4fr_80px_80px_40px]" style={{ background: "var(--c-primary-soft)" }}>
                <div>
                  <label className="label text-xs" htmlFor={`item-name-${item.key}`}>
                    Kriteria
                  </label>
                  <input
                    id={`item-name-${item.key}`}
                    className="input !py-2"
                    value={item.name}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, { name: e.target.value })}
                    placeholder="Ketepatan simpul"
                  />
                </div>
                <div>
                  <label className="label text-xs" htmlFor={`item-hint-${item.key}`}>
                    Keterangan untuk juri
                  </label>
                  <input
                    id={`item-hint-${item.key}`}
                    className="input !py-2"
                    value={item.hint}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, { hint: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label text-xs" htmlFor={`item-max-${item.key}`}>
                    Maks
                  </label>
                  <input
                    id={`item-max-${item.key}`}
                    type="number"
                    min={1}
                    className="input num !py-2"
                    value={item.max}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, { max: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="label text-xs" htmlFor={`item-weight-${item.key}`}>
                    Bobot
                  </label>
                  <input
                    id={`item-weight-${item.key}`}
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="input num !py-2"
                    value={item.weight}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, { weight: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="btn btn-ghost min-h-[44px] px-2"
                    onClick={() => removeItem(sectionIndex, itemIndex)}
                    aria-label="Hapus kriteria"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary mt-3 text-sm" onClick={() => addItem(sectionIndex)}>
            <Icon name="plus" size={16} /> Tambah kriteria
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={addSection}>
          <Icon name="plus" size={16} /> Tambah kategori penilaian
        </button>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Penalti</h3>
          <button type="button" className="btn btn-secondary text-sm" onClick={addPenalty}>
            Tambah
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {penalties.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>
              Belum ada penalti.
            </p>
          ) : (
            penalties.map((penalty, index) => (
              <div key={penalty.key} className="flex gap-2">
                <input
                  aria-label="Nama penalti"
                  className="input"
                  value={penalty.name}
                  placeholder="Terlambat masuk lapangan"
                  onChange={(e) =>
                    setPenalties((prev) => prev.map((p, i) => (i === index ? { ...p, name: e.target.value } : p)))
                  }
                />
                <input
                  aria-label="Nilai pengurangan"
                  type="number"
                  min={0}
                  className="input num w-24"
                  value={penalty.value}
                  onChange={(e) =>
                    setPenalties((prev) => prev.map((p, i) => (i === index ? { ...p, value: Number(e.target.value) } : p)))
                  }
                />
                <button
                  type="button"
                  className="btn btn-ghost px-3"
                  aria-label="Hapus penalti"
                  onClick={() => setPenalties((prev) => prev.filter((_, i) => i !== index))}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
