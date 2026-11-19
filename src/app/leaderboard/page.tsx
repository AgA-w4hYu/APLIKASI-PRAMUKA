import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CATEGORIES, categoryColor, categoryLabel, formatScore } from "@/lib/constants";
import { listContests } from "@/lib/services/contests";
import { isReleased, releasedCategories, standings } from "@/lib/services/leaderboard";
import { DEFAULT_THEMES, themeCss } from "@/lib/themeTokens";
import { Icon } from "@/components/ui";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ contest?: string; category?: string; besar?: string }>;
}) {
  const query = await searchParams;
  const user = await getSession();
  const db = getDb();
  const contests = listContests().filter((c) => c.show_leaderboard);
  const selected = contests.find((c) => c.id === Number(query.contest)) ?? contests[0];
  const categoryFilter = query.category && CATEGORIES.some((c) => c.key === query.category) ? query.category : "semua";
  const big = query.besar === "1";

  const ownTeamId = user?.teamId ?? null;
  const seesEverything = user?.permissions.includes("nilai.semua") ?? false;

  const rows = selected ? standings(selected.id).filter((row) => row.score !== null) : [];
  const released = selected ? releasedCategories(selected.id) : [];

  return (
    <div style={themeCss(DEFAULT_THEMES.penegak)} className="relative z-10 min-h-screen">
      <header className="border-b" style={{ borderColor: "var(--c-border)" }}>
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold"
              style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
            >
              A9
            </span>
            <span className="display text-lg font-semibold">ABRAKADABRA 9</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={big ? "/leaderboard" : `/leaderboard?besar=1${selected ? `&contest=${selected.id}` : ""}`}
              className="btn btn-secondary text-sm"
            >
              {big ? "Ukuran normal" : "Mode layar besar"}
            </Link>
            <Link href={user ? "/" : "/login"} className="btn btn-primary text-sm">
              {user ? "Kembali" : "Masuk"}
            </Link>
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-content px-4 pb-16 sm:px-6 ${big ? "text-lg" : ""}`}>
        <div className="py-8">
          <p className="text-xs font-bold uppercase tracking-[0.28em]" style={{ color: "var(--c-accent)" }}>
            Papan peringkat
          </p>
          <h1 className={`display mt-2 font-semibold ${big ? "text-5xl sm:text-7xl" : "text-4xl sm:text-5xl"}`}>
            Leaderboard
          </h1>
          <p className="mt-2 max-w-2xl" style={{ color: "var(--c-muted)" }}>
            Peringkat dan nama tim terbuka untuk semua. Nilai angka hanya terlihat pada baris tim sendiri.
          </p>
        </div>

        <nav aria-label="Pilih lomba" className="mb-3 flex flex-wrap gap-2">
          {contests.map((contest) => (
            <Link
              key={contest.id}
              href={`/leaderboard?contest=${contest.id}${big ? "&besar=1" : ""}`}
              className="btn text-sm"
              style={
                contest.id === selected?.id
                  ? { background: "var(--c-primary)", color: "var(--c-on-primary)", minHeight: 44 }
                  : { background: "var(--c-surface)", border: "1px solid var(--c-border)", minHeight: 44 }
              }
            >
              {contest.name}
            </Link>
          ))}
        </nav>

        {selected ? (
          <nav aria-label="Pilih kategori" className="mb-6 flex flex-wrap gap-2 text-sm">
            <Link
              href={`/leaderboard?contest=${selected.id}${big ? "&besar=1" : ""}`}
              className="badge"
              style={categoryFilter === "semua" ? { background: "var(--c-accent-soft)" } : {}}
            >
              Semua kategori
            </Link>
            {CATEGORIES.map((category) => (
              <Link
                key={category.key}
                href={`/leaderboard?contest=${selected.id}&category=${category.key}${big ? "&besar=1" : ""}`}
                className="badge"
                style={categoryFilter === category.key ? { background: category.color, color: "#fff" } : {}}
              >
                {category.label}
              </Link>
            ))}
          </nav>
        ) : null}

        {!selected ? (
          <p className="card p-6" style={{ color: "var(--c-muted)" }}>
            Belum ada lomba dengan leaderboard aktif.
          </p>
        ) : released.length === 0 ? (
          <div className="card p-8 text-center">
            <Icon name="clock" size={28} />
            <p className="mt-2 text-xl font-semibold">Nilai belum dirilis panitia</p>
            <p className="mt-1" style={{ color: "var(--c-muted)" }}>
              Peringkat akan muncul di sini setelah panitia merilis hasil {selected.name}.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {CATEGORIES.filter((c) => categoryFilter === "semua" || c.key === categoryFilter).map((category) => {
              const visible = rows.filter((row) => row.category === category.key);
              if (visible.length === 0) return null;
              const categoryReleased = released.includes(category.key);
              return (
                <section key={category.key}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: categoryColor(category.key) }} aria-hidden="true" />
                    <h2 className="text-xl font-semibold">{categoryLabel(category.key)}</h2>
                    {categoryReleased ? null : (
                      <span className="badge">Belum dirilis panitia</span>
                    )}
                  </div>
                  {categoryReleased ? (
                    <ol className="divide-y overflow-hidden rounded-2xl border bg-surface" style={{ borderColor: "var(--c-border)" }}>
                      {visible.map((row) => {
                        const own = ownTeamId === row.teamId;
                        const showScore = own || seesEverything;
                        return (
                          <li
                            key={row.teamId}
                            className="flex items-center justify-between gap-3 px-4 py-3"
                            style={own ? { background: "var(--c-accent-soft)" } : undefined}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className={`num grid h-9 w-9 shrink-0 place-items-center rounded-full font-semibold ${big ? "h-12 w-12 text-xl" : ""}`}
                                style={{
                                  background: row.rank && row.rank <= 3 ? category.color : "var(--c-primary-soft)",
                                  color: row.rank && row.rank <= 3 ? "#fff" : "var(--c-text)",
                                }}
                              >
                                {row.rank ?? "—"}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold">
                                  {row.name}
                                  {own ? (
                                    <span className="badge ml-2" style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}>
                                      Peringkat Anda
                                    </span>
                                  ) : null}
                                </p>
                                <p className="num text-xs" style={{ color: "var(--c-muted)" }}>
                                  {row.npp}
                                </p>
                              </div>
                            </div>
                            <span className={`num font-semibold ${big ? "text-2xl" : "text-lg"}`}>
                              {showScore ? formatScore(row.score) : "•••"}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="card p-5" style={{ color: "var(--c-muted)" }}>
                      Hasil kategori ini belum dirilis.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-xs" style={{ color: "var(--c-muted)" }}>
          Nilai akhir adalah rata-rata penilaian juri. Untuk LCTP, nilai dihitung otomatis dari jawaban.
        </p>
      </main>
    </div>
  );
}
