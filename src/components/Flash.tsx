import { Alert } from "@/components/ui";

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className="mb-5 space-y-2">
      {error ? (
        <Alert tone="danger" title="Tidak tersimpan">
          {error}
        </Alert>
      ) : null}
      {ok ? (
        <Alert tone="success" title="Berhasil">
          {ok}
        </Alert>
      ) : null}
    </div>
  );
}
