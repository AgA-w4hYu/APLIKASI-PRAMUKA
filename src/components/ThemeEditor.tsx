"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  THEME_ROLES,
  TOKEN_KEYS,
  TOKEN_LABELS,
  checkThemeContrast,
  themeCss,
  type Tokens,
} from "@/lib/themeTokens";
import { PALETTE } from "@/lib/constants";

export function ThemeEditor({ themes }: { themes: Record<string, Tokens> }) {
  const router = useRouter();
  const [role, setRole] = useState(THEME_ROLES[0].key);
  const [draft, setDraft] = useState<Record<string, Tokens>>(themes);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const tokens = draft[role];
  const checks = useMemo(() => checkThemeContrast(tokens), [tokens]);
  const failing = checks.filter((c) => !c.ok);

  async function save(reset: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, reset, tokens: reset ? undefined : tokens }),
      });
      const data = (await response.json()) as { error?: string; tokens?: Tokens };
      if (!response.ok) {
        setMessage({ tone: "error", text: data.error ?? "Tema tidak dapat disimpan." });
        return;
      }
      if (data.tokens) setDraft((prev) => ({ ...prev, [role]: data.tokens! }));
      setMessage({
        tone: "ok",
        text: reset ? "Tema dikembalikan ke bawaan." : "Tema tersimpan dan langsung dipakai.",
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Koneksi terputus. Coba lagi." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="card p-4">
          <p className="label">Pilih role atau kategori</p>
          <div className="flex flex-wrap gap-2">
            {THEME_ROLES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRole(item.key)}
                className="btn text-sm"
                style={
                  role === item.key
                    ? { background: "var(--c-primary)", color: "var(--c-on-primary)", minHeight: 44 }
                    : { background: "var(--c-surface)", border: "1px solid var(--c-border)", minHeight: 44 }
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-semibold">Token warna</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {TOKEN_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-3 rounded-xl border p-2" style={{ borderColor: "var(--c-border)" }}>
                <input
                  type="color"
                  aria-label={`Warna ${TOKEN_LABELS[key]}`}
                  value={tokens[key]}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [role]: { ...prev[role], [key]: e.target.value } }))}
                  className="h-11 w-11 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{TOKEN_LABELS[key]}</p>
                  <input
                    aria-label={`Kode warna ${TOKEN_LABELS[key]}`}
                    className="num w-full bg-transparent text-xs uppercase outline-none"
                    style={{ color: "var(--c-muted)" }}
                    value={tokens[key]}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [role]: { ...prev[role], [key]: e.target.value.toUpperCase() } }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="label mt-4">Palet Rustic Earthy</p>
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((color) => (
              <span
                key={color.hex}
                title={`${color.name} ${color.hex}`}
                className="h-8 w-8 rounded-lg border"
                style={{ background: color.hex, borderColor: "var(--c-border)" }}
              />
            ))}
          </div>
          <p className="mt-1 text-xs" style={{ color: "var(--c-muted)" }}>
            Klik pemilih warna untuk memakai nilai palet. Kombinasi wajib lulus kontras 4.5:1.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={saving || failing.length > 0}>
              Simpan tema
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => save(true)} disabled={saving}>
              Kembalikan bawaan
            </button>
          </div>
          {failing.length > 0 ? (
            <p role="alert" className="mt-3 text-sm" style={{ color: "var(--c-danger)" }}>
              Belum bisa disimpan: {failing.map((f) => f.pair).join(", ")} di bawah 4.5:1.
            </p>
          ) : null}
          {message ? (
            <p
              role="status"
              className="mt-3 rounded-xl p-3 text-sm"
              style={
                message.tone === "ok"
                  ? { background: "rgba(96,106,70,0.12)", color: "var(--c-success)" }
                  : { background: "rgba(142,47,35,0.1)", color: "var(--c-danger)" }
              }
            >
              {message.text}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <div className="card overflow-hidden p-0">
          <div className="p-4">
            <h2 className="text-lg font-semibold">Pratinjau langsung</h2>
          </div>
          <div style={themeCss(tokens)} className="p-5" >
            <div className="rounded-xl p-4" style={{ background: "var(--c-bg)", color: "var(--c-text)" }}>
              <p className="display text-xl font-semibold">ABRAKADABRA 9</p>
              <p className="mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
                Contoh teks sekunder pada latar halaman.
              </p>
              <div className="mt-3 rounded-xl p-3" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
                <p className="text-sm font-semibold">Kartu penilaian</p>
                <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                  Tim Garuda · NPP PNG-001
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}>
                    Kirim Nilai
                  </span>
                  <span className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--c-accent-soft)" }}>
                    Aksen lembut
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--c-success)" }}>
                    ✓ Sukses
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--c-danger)" }}>
                    ⚠ Galat
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-semibold">Pemeriksa kontras</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {checks.map((check) => (
              <li key={check.pair} className="flex items-center justify-between gap-2">
                <span>{check.pair}</span>
                <span className="num font-semibold" style={{ color: check.ok ? "var(--c-success)" : "var(--c-danger)" }}>
                  {check.ok ? "✓" : "⚠"} {check.ratio}:1
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs" style={{ color: "var(--c-muted)" }}>
            Standar WCAG AA: 4.5:1 untuk teks biasa. Panitia tidak dapat menyimpan kombinasi yang sulit dibaca.
          </p>
        </div>
      </div>
    </div>
  );
}
