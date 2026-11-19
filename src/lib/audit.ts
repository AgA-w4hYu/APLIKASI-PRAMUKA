import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";

export interface AuditActor {
  id: number | null;
  name: string;
}

/**
 * Append-only audit chain. Every entry carries the hash of the entry before it,
 * so silent edits to the history become detectable.
 */
export function appendAudit(
  actor: AuditActor,
  action: string,
  entity: string,
  entityId: string | number | null,
  detail: unknown,
): void {
  const db = getDb();
  const prev = db.prepare("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").get() as
    | { hash: string }
    | undefined;
  const prevHash = prev?.hash ?? "GENESIS";
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify(detail ?? {});
  const actorText = actor.id ?? "-";
  const entityIdText = String(entityId ?? "");
  const hash = createHash("sha256")
    .update([prevHash, actorText, actor.name, action, entity, entityIdText, payload, createdAt].join("|"))
    .digest("hex");

  db.prepare(
    `INSERT INTO audit_log (prev_hash, hash, actor_id, actor_name, action, entity, entity_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(prevHash, hash, actor.id, actor.name, action, entity, entityIdText, payload, createdAt);
}

export interface AuditEntry {
  id: number;
  actor_id: number | null;
  actor_name: string;
  action: string;
  entity: string;
  entity_id: string;
  detail: string;
  created_at: string;
  hash: string;
  prev_hash: string;
}

/** Re-walks the chain to prove it has not been tampered with. */
export function verifyAuditChain(): { valid: boolean; brokenAt: number | null; count: number } {
  const rows = getDb()
    .prepare("SELECT * FROM audit_log ORDER BY id ASC")
    .all() as AuditEntry[];
  let prevHash = "GENESIS";
  for (const row of rows) {
    const expected = createHash("sha256")
      .update(
        [prevHash, row.actor_id ?? "-", row.actor_name, row.action, row.entity, row.entity_id, row.detail, row.created_at].join("|"),
      )
      .digest("hex");
    if (row.prev_hash !== prevHash || row.hash !== expected) {
      return { valid: false, brokenAt: row.id, count: rows.length };
    }
    prevHash = row.hash;
  }
  return { valid: true, brokenAt: null, count: rows.length };
}
