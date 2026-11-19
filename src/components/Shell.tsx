"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import type { NavItem } from "@/lib/nav";

interface ShellProps {
  children: ReactNode;
  nav: NavItem[];
  active: string;
  roleName: string;
  userName: string;
  theme: CSSProperties;
  teamName?: string | null;
}

export function Shell({ children, nav, active, roleName, userName, theme, teamName }: ShellProps) {
  const router = useRouter();
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("ab9-scale");
    if (stored) {
      const value = Number(stored);
      if ([1, 1.125, 1.25].includes(value)) {
        setScale(value);
        document.documentElement.style.setProperty("--font-scale", String(value));
      }
    }
  }, []);

  function cycleScale() {
    const next = scale === 1 ? 1.125 : scale === 1.125 ? 1.25 : 1;
    setScale(next);
    window.localStorage.setItem("ab9-scale", String(next));
    document.documentElement.style.setProperty("--font-scale", String(next));
  }

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={theme} className="relative z-10 min-h-screen" >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2"
        style={{ background: "var(--c-surface)" }}
      >
        Lompat ke isi
      </a>

      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{ borderColor: "var(--c-border)", background: "color-mix(in srgb, var(--c-bg) 88%, transparent)" }}
      >
        <div className="mx-auto flex max-w-wide items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href={nav[0]?.href ?? "/"} className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold"
              style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
              aria-hidden="true"
            >
              A9
            </span>
            <span className="leading-tight">
              <span className="display block text-base font-semibold sm:text-lg">ABRAKADABRA 9</span>
              <span className="block text-xs" style={{ color: "var(--c-muted)" }}>
                {roleName}
                {teamName ? ` · ${teamName}` : ""}
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={cycleScale}
              className="btn btn-ghost text-sm"
              aria-label={`Perbesar tulisan, ukuran saat ini ${Math.round(scale * 100)} persen`}
              title="Perbesar tulisan"
            >
              <span className="font-semibold" style={{ fontSize: scale === 1 ? "0.85rem" : scale === 1.125 ? "1rem" : "1.15rem" }}>
                Aa
              </span>
            </button>
            <span className="hidden max-w-[12rem] truncate text-sm sm:block" style={{ color: "var(--c-muted)" }}>
              {userName}
            </span>
            <button type="button" onClick={logout} className="btn btn-ghost" disabled={busy} aria-label="Keluar">
              <Icon name="logout" size={18} />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-wide gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav aria-label="Navigasi utama" className="sticky top-24 flex flex-col gap-1">
            {nav.map((item) => {
              const isActive = active === item.href || (item.href !== "/admin" && active.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
                  style={{
                    background: isActive ? "var(--c-primary)" : "transparent",
                    color: isActive ? "var(--c-on-primary)" : "var(--c-text)",
                  }}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main id="main" className="min-w-0 flex-1 pb-24 lg:pb-4">
          {children}
        </main>
      </div>

      <nav
        aria-label="Navigasi bawah"
        className="fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur lg:hidden"
        style={{ borderColor: "var(--c-border)", background: "color-mix(in srgb, var(--c-surface) 94%, transparent)" }}
      >
        <div className="flex gap-1 overflow-x-auto px-2 py-1.5">
          {nav.map((item) => {
            const isActive = active === item.href || (item.href !== "/admin" && active.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className="flex min-h-[56px] min-w-[76px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[0.68rem] font-semibold"
                style={{
                  background: isActive ? "var(--c-primary)" : "transparent",
                  color: isActive ? "var(--c-on-primary)" : "var(--c-muted)",
                }}
              >
                <Icon name={item.icon} size={20} />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
