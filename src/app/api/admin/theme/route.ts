import { NextResponse } from "next/server";
import { ApiError, readJson, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { getTheme, resetTheme, saveTheme } from "@/lib/theme";
import { THEME_ROLES, checkThemeContrast, type Tokens } from "@/lib/themeTokens";

export const POST = route(async (req: Request) => {
  const admin = await requirePermission("tema.ubah");
  const body = await readJson<{ role?: string; tokens?: Partial<Tokens>; reset?: boolean }>(req);
  const role = body.role ?? "";
  if (!THEME_ROLES.some((r) => r.key === role)) throw new ApiError("Role tema tidak dikenal.");

  if (body.reset) {
    resetTheme(role);
    appendAudit({ id: admin.id, name: admin.name }, "tema.reset", "theme", role, { role });
    return NextResponse.json({ ok: true, tokens: getTheme(role) });
  }

  if (!body.tokens) throw new ApiError("Token warna belum dikirim.");
  const merged = { ...getTheme(role), ...body.tokens } as Tokens;
  const failing = checkThemeContrast(merged).filter((check) => !check.ok);
  if (failing.length > 0) {
    throw new ApiError(
      `Kontras belum cukup: ${failing.map((f) => `${f.pair} (${f.ratio}:1)`).join(", ")}. Minimal 4.5:1 agar mudah dibaca.`,
    );
  }
  saveTheme(role, body.tokens);
  appendAudit({ id: admin.id, name: admin.name }, "tema.ubah", "theme", role, { role });
  return NextResponse.json({ ok: true, tokens: merged });
});
