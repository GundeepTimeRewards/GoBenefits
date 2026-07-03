/**
 * Documents repository (Phase E-3). SQL against a ROUTED customer-DB pool only —
 * the service authorizes + routes via getCustomerDb.
 *
 * METADATA-FIRST (product decision 2026-07-03): local/dev persists document ROWS
 * only — no file bytes. s3_key is reserved at insert ("pending/<uuid>/<name>");
 * the prod path uploads against that key via a presigned URL and the row is
 * already the index entry S3 needs. Nothing in the read models depends on bytes.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";

export type DocumentRow = {
  id: string;
  name: string;
  category: string;
  status: string; // Active | Signature Pending | Signed | Archived
  uploadedAt: string | null;
  planName: string | null; // linked benefit plan, when any
  employeeName: string | null; // linked employee, when any
  legacy: boolean;
};

const DOC_SELECT = `
  SELECT BIN_TO_UUID(d.id) AS id,
         d.file_name AS name,
         COALESCE(d.category, 'Uncategorized') AS category,
         DATE_FORMAT(d.uploaded_at, '%Y-%m-%dT%H:%i:%sZ') AS uploadedAt,
         (d.legacy_path IS NOT NULL) AS legacy,
         (SELECT bp.plan_name FROM document_link dl JOIN benefit_plan bp ON bp.id = dl.entity_id
           WHERE dl.document_id = d.id AND dl.entity_type = 'benefit_plan' LIMIT 1) AS planName,
         (SELECT CONCAT(e.first_name, ' ', e.last_name) FROM document_link dl JOIN employee e ON e.id = dl.entity_id
           WHERE dl.document_id = d.id AND dl.entity_type = 'employee' LIMIT 1) AS employeeName,
         (SELECT sr.status FROM signature_request sr WHERE sr.document_id = d.id
           ORDER BY sr.requested_at DESC LIMIT 1) AS sigStatus`;

function toRow(r: any): DocumentRow {
  const sig = r.sigStatus as string | null;
  const status = r.legacy && Number(r.legacy) === 1
    ? "Archived"
    : sig === "signed" ? "Signed"
    : sig === "pending" || sig === "sent" ? "Signature Pending"
    : "Active";
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    status,
    uploadedAt: r.uploadedAt ?? null,
    planName: r.planName ?? null,
    employeeName: r.employeeName ?? null,
    legacy: Boolean(Number(r.legacy)),
  };
}

/** Documents linked to the plan year (directly, or via one of its benefit plans). */
export async function listDocuments(db: Pool, planYearId: string): Promise<DocumentRow[]> {
  const [rows] = await db.query(
    `${DOC_SELECT}
     FROM document d
     WHERE EXISTS (SELECT 1 FROM document_link dl WHERE dl.document_id = d.id
                    AND dl.entity_type = 'plan_year' AND dl.entity_id = UUID_TO_BIN(:planYearId))
        OR EXISTS (SELECT 1 FROM document_link dl JOIN benefit_plan bp ON bp.id = dl.entity_id
                    WHERE dl.document_id = d.id AND dl.entity_type = 'benefit_plan'
                      AND bp.plan_year_id = UUID_TO_BIN(:planYearId))
     ORDER BY d.uploaded_at DESC`,
    { planYearId }
  );
  return (rows as any[]).map(toRow);
}

export async function getDocument(db: Pool, documentId: string): Promise<DocumentRow | null> {
  const [rows] = await db.query(`${DOC_SELECT} FROM document d WHERE d.id = UUID_TO_BIN(:documentId) LIMIT 1`, {
    documentId,
  });
  const r = (rows as any[])[0];
  return r ? toRow(r) : null;
}

/**
 * Insert a metadata-first document + its links, in one transaction. Returns the id.
 * s3_key is reserved; prod uploads bytes against it later.
 */
export async function insertDocument(
  db: Pool,
  args: {
    name: string;
    category: string;
    uploadedBy: string;
    planYearId: string;
    planId?: string | null;
    employeeId?: string | null;
  }
): Promise<string> {
  const id = randomUUID();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO document (id, category, file_name, s3_key, uploaded_by)
       VALUES (UUID_TO_BIN(:id), :category, :name, :s3Key, UUID_TO_BIN(:uploadedBy))`,
      { id, category: args.category, name: args.name, s3Key: `pending/${id}/${args.name}`, uploadedBy: args.uploadedBy }
    );
    await conn.query(
      `INSERT INTO document_link (document_id, entity_type, entity_id)
       VALUES (UUID_TO_BIN(:id), 'plan_year', UUID_TO_BIN(:planYearId))`,
      { id, planYearId: args.planYearId }
    );
    if (args.planId) {
      await conn.query(
        `INSERT INTO document_link (document_id, entity_type, entity_id)
         VALUES (UUID_TO_BIN(:id), 'benefit_plan', UUID_TO_BIN(:planId))`,
        { id, planId: args.planId }
      );
    }
    if (args.employeeId) {
      await conn.query(
        `INSERT INTO document_link (document_id, entity_type, entity_id)
         VALUES (UUID_TO_BIN(:id), 'employee', UUID_TO_BIN(:employeeId))`,
        { id, employeeId: args.employeeId }
      );
    }
    await conn.commit();
    return id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function insertSignatureRequest(db: Pool, documentId: string, employeeId: string | null): Promise<void> {
  await db.query(
    `INSERT INTO signature_request (document_id, employee_id, provider, status, requested_at)
     VALUES (UUID_TO_BIN(:documentId), ${employeeId ? "UUID_TO_BIN(:employeeId)" : "NULL"}, 'internal', 'sent', NOW(3))`,
    { documentId, employeeId }
  );
}

/** Plans in the year with their doc-link counts (readiness signal — same one the catalog uses). */
export async function planDocCoverage(db: Pool, planYearId: string): Promise<{ planId: string; planName: string; docCount: number }[]> {
  const [rows] = await db.query(
    `SELECT BIN_TO_UUID(bp.id) AS planId, bp.plan_name AS planName,
            (SELECT COUNT(*) FROM document_link dl WHERE dl.entity_type = 'benefit_plan' AND dl.entity_id = bp.id) AS docCount
     FROM benefit_plan bp WHERE bp.plan_year_id = UUID_TO_BIN(:planYearId)`,
    { planYearId }
  );
  return (rows as any[]).map((r) => ({ planId: r.planId, planName: r.planName, docCount: Number(r.docCount) }));
}

/** Approved-election employees WITHOUT a confirmation document for this plan year. */
export async function employeesNeedingConfirmations(db: Pool, planYearId: string): Promise<{ employeeId: string; name: string }[]> {
  const [rows] = await db.query(
    `SELECT DISTINCT BIN_TO_UUID(e.id) AS employeeId, CONCAT(e.first_name, ' ', e.last_name) AS name
     FROM employee_election el
     JOIN enrollment_event ev ON ev.id = el.enrollment_event_id
     JOIN employee e ON e.id = el.employee_id
     WHERE ev.plan_year_id = UUID_TO_BIN(:planYearId) AND el.status = 'approved'
       AND NOT EXISTS (
         SELECT 1 FROM document d
         JOIN document_link dle ON dle.document_id = d.id AND dle.entity_type = 'employee' AND dle.entity_id = e.id
         JOIN document_link dlp ON dlp.document_id = d.id AND dlp.entity_type = 'plan_year' AND dlp.entity_id = UUID_TO_BIN(:planYearId)
         WHERE d.category = 'confirmation')`,
    { planYearId }
  );
  return (rows as any[]).map((r) => ({ employeeId: r.employeeId, name: r.name }));
}

/** Signature requests still awaiting action (employee-action count). */
export async function pendingSignatureCount(db: Pool, planYearId: string): Promise<number> {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS n FROM signature_request sr
     JOIN document_link dl ON dl.document_id = sr.document_id AND dl.entity_type = 'plan_year'
      AND dl.entity_id = UUID_TO_BIN(:planYearId)
     WHERE sr.status IN ('pending','sent')`,
    { planYearId }
  );
  return Number((rows as any[])[0].n);
}
