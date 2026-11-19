"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/constants";

interface Conflict {
  device?: string;
  since?: string;
}

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(confirmKick: boolean) {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, remember, confirmKick }),
      });
      const data = (await response.json()) as {
        error?: string;
        redirect?: string;
        code?: string;
        device?: string;
        since?: string;
      };
      if (!response.ok) {
        if (data.code === "sesi_aktif") {
          setConflict({ device: data.device, since: data.since });
        } else {
          setError(data.error ?? "Tidak dapat masuk. Coba lagi.");
        }
        return;
      }
      setConflict(null);
      router.push(data.redirect ?? "/");
      router.refresh();
    } catch {
      setError("Koneksi terputus. Periksa jaringan lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await send(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="username" className="label">
          Nama pengguna
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          className="input min-h-[56px] text-lg"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setConflict(null);
          }}
          required
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Kata sandi
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="input min-h-[56px] w-full pr-14 text-lg"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 grid w-14 place-items-center rounded-r-xl"
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
            aria-pressed={showPassword}
            style={{ color: "var(--c-muted)" }}
          >
            {showPassword ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      <label htmlFor="remember" className="flex min-h-[48px] items-center gap-3 text-base">
        <input
          id="remember"
          type="checkbox"
          className="h-5 w-5"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        <span>
          Tetap masuk di perangkat ini
          <span className="block text-sm" style={{ color: "var(--c-muted)" }}>
            Sesi bertahan 12 jam, cocok untuk hari acara.
          </span>
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-xl px-3 py-2 text-base font-medium" style={{ background: "rgba(142,47,35,0.1)", color: "var(--c-danger)" }}>
          {error}
        </p>
      ) : null}

      {conflict ? (
        <div role="alert" className="rounded-xl p-3 text-sm" style={{ background: "var(--c-accent-soft)" }}>
          <p className="font-semibold">Akun ini sudah aktif di perangkat lain.</p>
          <p className="mt-1" style={{ color: "var(--c-muted)" }}>
            {conflict.device ?? "Perangkat lain"} · masuk {formatDate(conflict.since)}
          </p>
          <p className="mt-1" style={{ color: "var(--c-muted)" }}>
            Keluarkan perangkat itu dan lanjutkan di sini?
          </p>
          <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => send(true)} disabled={loading}>
            {loading ? "Memproses…" : "Keluarkan perangkat lain dan masuk"}
          </button>
        </div>
      ) : null}

      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
        {loading ? "Memeriksa…" : "Masuk"}
      </button>

      <p className="text-center text-base" style={{ color: "var(--c-muted)" }}>
        Akun dibagikan panitia. Tidak ada pendaftaran sendiri.
      </p>
      <a href="tel:+62610000000" className="btn btn-secondary w-full min-h-[56px]">
        Lupa kata sandi? Hubungi Panitia
      </a>
    </form>
  );
}
