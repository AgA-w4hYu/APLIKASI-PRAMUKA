import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function jsonError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function mapError(error: unknown): NextResponse {
  if (error instanceof ApiError) return jsonError(error.message, error.status);
  if (error instanceof AuthError) return jsonError(error.message, error.status);
  console.error("[api]", error);
  return jsonError("Terjadi gangguan pada server. Coba lagi sebentar.", 500);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError("Data yang dikirim tidak dapat dibaca.");
  }
}

/** State-changing requests must come from this same origin. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("host");
  try {
    if (new URL(origin).host !== host) {
      throw new ApiError("Permintaan ditolak: asal permintaan tidak dikenal.", 403);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Permintaan ditolak.", 403);
  }
}

type Handler<T> = (req: Request, ctx: T) => Promise<NextResponse | Response>;

export function route<T = unknown>(handler: Handler<T>) {
  return async (req: Request, ctx: T): Promise<NextResponse | Response> => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (error) {
      return mapError(error);
    }
  };
}
