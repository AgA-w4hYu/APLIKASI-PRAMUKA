import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import { getSetting } from "@/lib/db";
import { DEFAULT_THEMES, themeCss } from "@/lib/themeTokens";

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(homeFor(user));

  return (
    <div style={themeCss(DEFAULT_THEMES.admin)} className="relative z-10 min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section
        className="relative flex flex-col justify-between overflow-hidden px-6 py-10 sm:px-10 lg:px-14 lg:py-14"
        style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border"
          style={{ borderColor: "rgba(246,240,230,0.18)" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full border"
          style={{ borderColor: "rgba(246,240,230,0.12)" }}
        />

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em]" style={{ color: "#BDAE8F" }}>
            SMK Telkom 1 Medan
          </p>
          <h1 className="display mt-4 text-5xl leading-none sm:text-6xl lg:text-7xl">ABRAKADABRA 9</h1>
          <p className="mt-4 max-w-md text-base opacity-85 sm:text-lg">
            Penilaian lomba Pramuka yang rapi, jujur, dan tenang. Satu tempat untuk juri, peserta, dan panitia.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          {["LKBB", "Pionering", "LCTP", "Scouting Skill"].map((name) => (
            <span
              key={name}
              className="rounded-full border px-3 py-1.5 text-sm"
              style={{ borderColor: "rgba(246,240,230,0.28)" }}
            >
              {name}
            </span>
          ))}
        </div>

        <div className="mt-10 hidden text-sm opacity-70 lg:block">
          <p>{getSetting("event_venue")}</p>
          <p>Tahun {getSetting("event_year")}</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="card w-full max-w-md p-6 sm:p-8">
          <h2 className="text-2xl font-semibold">Masuk ke aplikasi</h2>
          <p className="mb-6 mt-1 text-sm" style={{ color: "var(--c-muted)" }}>
            Gunakan akun yang dibagikan panitia. Tampilan juri dibuat besar dan sederhana.
          </p>
          <LoginForm />

          <div className="mt-6 rounded-xl p-3 text-xs" style={{ background: "var(--c-primary-soft)", color: "var(--c-muted)" }}>
            <p className="font-semibold" style={{ color: "var(--c-text)" }}>
              Akun contoh untuk mencoba
            </p>
            <p className="num mt-1">admin / admin123 · juri-lkbb-01 / juri123 · png001 / peserta123</p>
          </div>
        </div>
      </section>
    </div>
  );
}
