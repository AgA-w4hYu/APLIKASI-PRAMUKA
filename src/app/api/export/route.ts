import { ApiError, route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { buildDocx, buildXlsx, reportFilename } from "@/lib/services/reports";

export const GET = route(async (req: Request) => {
  const user = await requirePermission("laporan.unduh");
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "docx";
  const contestId = Number(url.searchParams.get("contest")) || undefined;
  const categoryParam = url.searchParams.get("category") ?? "";
  if (contestId && Number.isNaN(contestId)) throw new ApiError("Lomba tidak dikenal.");
  let category: string | undefined = categoryParam || undefined;

  const scope = { contestId, category };
  const buffer = format === "xlsx" ? buildXlsx(scope) : await buildDocx(scope);
  appendAudit({ id: user.id, name: user.name }, "laporan.unduh", "report", null, { format, contestId, category });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${reportFilename(format)}"`,
      "Cache-Control": "no-store",
    },
  });
});
