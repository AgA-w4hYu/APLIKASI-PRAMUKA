import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { route } from "@/lib/http";
import { SESSION_COOKIE, destroySession } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";

export const POST = route(async () => {
  const store = await cookies();
  const user = await getSession();
  destroySession(store.get(SESSION_COOKIE)?.value);
  if (user) {
    appendAudit({ id: user.id, name: user.name }, "sesi.keluar", "user", user.id, {});
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
});
