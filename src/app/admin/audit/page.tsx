import { AuthShell } from "@/components/AuthShell";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { pageUser } from "@/lib/pageGuard";
import { verifyAuditChain } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/constants";

export default async function AuditPage() {
  const user = await pageUser("audit.lihat");
  const chain = verifyAuditChain();
  const rows = getDb()
    .prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 200")
    .all() as {
    id: number;
    actor_name: string;
    action: string;
    entity: string;
    entity_id: string;
    detail: string;
    created_at: string;
    hash: string;
  }[];

  return (
    <AuthShell user={user} active="/admin/audit">
      <PageHeader
        eyebrow="Administrasi"
        title="Riwayat perubahan"
        description="Log bersifat tambah-saja dan dirantai dengan hash. Tidak ada tombol hapus di antarmuka mana pun."
      />

      <div className="mb-5">
        {chain.valid ? (
          <Alert tone="success" title={`Rantai audit utuh (${chain.count} entri)`}>
            Setiap entri terhubung ke entri sebelumnya melalui hash SHA-256. Perubahan diam-diam akan memutus rantai.
          </Alert>
        ) : (
          <Alert tone="danger" title={`Rantai audit terputus pada entri #${chain.brokenAt}`}>
            Riwayat mungkin pernah diubah langsung di database. Laporkan ke panitia dan periksa cadangan.
          </Alert>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0" style={{ background: "var(--c-surface)" }}>
              <tr className="text-left" style={{ color: "var(--c-muted)" }}>
                <th className="px-5 py-3 font-semibold">Waktu</th>
                <th className="px-3 py-3 font-semibold">Pelaku</th>
                <th className="px-3 py-3 font-semibold">Tindakan</th>
                <th className="px-3 py-3 font-semibold">Objek</th>
                <th className="px-5 py-3 font-semibold">Rincian</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top" style={{ borderColor: "var(--c-border)" }}>
                  <td className="px-5 py-3 text-xs" style={{ color: "var(--c-muted)" }}>
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-3 py-3">{row.actor_name}</td>
                  <td className="px-3 py-3">
                    <Badge>{row.action}</Badge>
                  </td>
                  <td className="px-3 py-3 text-xs" style={{ color: "var(--c-muted)" }}>
                    {row.entity} #{row.entity_id || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <code className="num break-all text-xs" style={{ color: "var(--c-muted)" }}>
                      {row.detail}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AuthShell>
  );
}
