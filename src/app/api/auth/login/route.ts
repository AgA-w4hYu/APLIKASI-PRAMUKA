import { NextResponse } from "next/server";
import { ApiError, readJson, route } from "@/lib/http";
import { appendAudit } from "@/lib/audit";
import {
  SESSION_COOKIE,
  activeSessions,
  createSession,
  login,
  revokeAllSessions,
  sessionCookieOptions,
} from "@/lib/auth";
import { homeFor } from "@/lib/nav";
import { clientKey, rateLimit } from "@/lib/rateLimit";

interface LoginBody {
  username?: string;
  password?: string;
  remember?: boolean;
  confirmKick?: boolean;
}

export const POST = route(async (req: Request) => {
  if (!rateLimit(clientKey(req, "login"), 12, 60_000)) {
    throw new ApiError("Terlalu banyak percobaan masuk. Tunggu satu menit.", 429);
  }
  const body = await readJson<LoginBody>(req);
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) throw new ApiError("Nama pengguna dan kata sandi wajib diisi.");

  let user;
  try {
    user = login(username, password);
  } catch (error) {
    appendAudit({ id: null, name: username.slice(0, 40) || "Tamu" }, "sesi.gagal", "auth", null, {
      status: error instanceof Error && "status" in error ? (error as { status: number }).status : 401,
    });
    throw error;
  }

  // Juri dan peserta hanya boleh punya satu sesi aktif.
  const singleSession = user.role === "juri" || user.role === "peserta";
  const existing = activeSessions(user.id);
  if (singleSession && existing.length > 0) {
    if (!body.confirmKick) {
      return NextResponse.json(
        {
          error:
            "Akun ini sedang dipakai di perangkat lain. Keluarkan perangkat itu bila Anda ingin melanjutkan di sini.",
          code: "sesi_aktif",
          device: existing[0].device,
          since: existing[0].created_at,
        },
        { status: 409 },
      );
    }
    revokeAllSessions(user.id);
    appendAudit({ id: user.id, name: user.name }, "sesi.keluarkan_perangkat_lain", "user", user.id, {});
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const token = createSession(user.id, {
    remember: Boolean(body.remember),
    device: req.headers.get("user-agent")?.slice(0, 250) ?? null,
    ip: forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip"),
  });
  appendAudit({ id: user.id, name: user.name }, "sesi.masuk", "user", user.id, { role: user.role });

  const response = NextResponse.json({
    ok: true,
    redirect: user.mustChangePassword ? "/akun/sandi" : homeFor(user),
    mustChangePassword: user.mustChangePassword,
    kicked: singleSession && existing.length > 0,
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(Boolean(body.remember)));
  return response;
});
