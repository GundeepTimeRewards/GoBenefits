/**
 * Documents workspace integration tests (Phase E-3, metadata-first; requires local
 * MySQL).  docker compose up -d && bun install && bun local/setup.ts && bun test
 *
 * Proves the workspace readiness derives from the SAME plan-doc link signal the
 * Plans & Rates catalog uses (uploading a plan doc flips BOTH), signature requests
 * change document status, confirmations generate idempotently for approved-election
 * employees, and the permission x scope boundaries hold.
 *
 * State discipline: all documents/links/signature requests created here are
 * removed (document_link + signature rows cascade or are deleted explicitly);
 * seed election statuses restored.
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";

process.env.DB_HOST ??= "127.0.0.1";
process.env.DB_PORT ??= "3306";
process.env.DB_USER ??= "root";
process.env.DB_PASSWORD ??= "goben";
process.env.CONTROL_PLANE_DB ??= "control_plane";

import { buildAuthContext, getCustomerDb } from "@goben/data-access";
import { employerService } from "../src/index";
import { setupLocal } from "../../../local/setup";

const EMP_A = "eeee0000-0000-0000-0000-0000000000a1";
const PY_2026 = "a2220000-0000-0000-0000-000000000002";
const PY_2025_ARCHIVED = "a2220000-0000-0000-0000-000000000001";
const PLAN_MEDICAL = "c3330000-0000-0000-0000-000000000001";
const EL_ALICE_MED = "e4440000-0000-0000-0000-000000000001";

async function dbA() {
  const ctx = await buildAuthContext("sub-emp-admin-a");
  const { db } = await getCustomerDb(ctx, "documents.read", EMP_A);
  return db;
}

async function resetTestState() {
  const db = await dbA();
  await db.query(`DELETE FROM signed_form WHERE 1=1`);
  await db.query(`DELETE FROM signature_request WHERE 1=1`);
  await db.query(`DELETE FROM document WHERE legacy_path IS NULL`); // links cascade
  await db.query(
    `UPDATE employee_election SET status = 'submitted', employee_cost = NULL, employer_contribution = NULL, premium_total = NULL
      WHERE id = UUID_TO_BIN('${EL_ALICE_MED}')`
  );
}

beforeAll(async () => {
  await setupLocal();
  await resetTestState();
});

afterAll(async () => {
  await resetTestState();
});

describe("documentWorkspace + uploadDocument", () => {
  test("readiness starts missing for both seed plans and heals as plan docs upload", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    let ws = await employerService.documentWorkspace(ctx, EMP_A, PY_2026);
    expect(ws.missingCount).toBe(2); // both seed plans lack docs
    expect(ws.readinessPercent).toBe(0);
    expect(ws.tasks.filter((t) => t.label === "Upload plan documents / SBC").length).toBe(2);

    const doc = await employerService.uploadDocument(ctx, EMP_A, PY_2026, "SBC", "UHC-SBC-2026.pdf", PLAN_MEDICAL);
    expect(doc.status).toBe("Active");
    expect(doc.relatedTo).toBe("UHC Choice Plus PPO");

    ws = await employerService.documentWorkspace(ctx, EMP_A, PY_2026);
    expect(ws.missingCount).toBe(1);
    expect(ws.readinessPercent).toBe(50);
    expect(ws.documents.some((d) => d.name === "UHC-SBC-2026.pdf")).toBe(true);

    // The SAME link flips the Plans & Rates catalog's documentStatus.
    const catalog = await employerService.planCatalog(ctx, EMP_A, PY_2026);
    expect(catalog.plans.find((p) => p.planId === PLAN_MEDICAL)!.documentStatus).toBe("complete");
  });

  test("upload validation: blank fields, archived year, foreign plan id", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    expect(employerService.uploadDocument(ctx, EMP_A, PY_2026, "SBC", "  ")).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.uploadDocument(ctx, EMP_A, PY_2025_ARCHIVED, "SBC", "x.pdf")).rejects.toMatchObject({ name: "ValidationError" });
    expect(employerService.uploadDocument(ctx, EMP_A, PY_2026, "SBC", "x.pdf", "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ name: "ValidationError" });
  });
});

describe("signatures + confirmations", () => {
  test("requestSignature flips status to Signature Pending, exactly one open request", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    const ws = await employerService.documentWorkspace(ctx, EMP_A, PY_2026);
    const doc = ws.documents.find((d) => d.name === "UHC-SBC-2026.pdf")!;
    const res = await employerService.requestSignature(ctx, EMP_A, doc.documentId);
    expect(res.ok).toBe(true);

    const after = await employerService.documentWorkspace(ctx, EMP_A, PY_2026);
    expect(after.documents.find((d) => d.documentId === doc.documentId)!.status).toBe("Signature Pending");
    expect(after.employeeActionCount).toBe(1);
    expect(employerService.requestSignature(ctx, EMP_A, doc.documentId)).rejects.toMatchObject({ name: "ValidationError" });
  });

  test("generateConfirmations covers approved-election employees exactly once", async () => {
    const ctx = await buildAuthContext("sub-emp-admin-a");
    await employerService.approveElection(ctx, EMP_A, PY_2026, EL_ALICE_MED);

    let res = await employerService.generateConfirmations(ctx, EMP_A, PY_2026);
    expect(res.status).toBe("completed: 1 confirmation(s) generated");
    const ws = await employerService.documentWorkspace(ctx, EMP_A, PY_2026);
    const conf = ws.documents.find((d) => d.category === "confirmation")!;
    expect(conf.name).toBe("Enrollment Confirmation — Alice Anderson.pdf");
    expect(conf.status).toBe("Signature Pending"); // signature request created with it
    expect(conf.relatedTo).toBe("Alice Anderson");

    // Idempotent: Alice already has hers.
    res = await employerService.generateConfirmations(ctx, EMP_A, PY_2026);
    expect(res.status).toBe("completed: 0 confirmation(s) generated");
  });
});

describe("authorization", () => {
  test("broker reads the workspace and can manage docs; employee reads only; cross-tenant denied", async () => {
    const broker = await buildAuthContext("sub-broker-a"); // documents.manage since 0002
    const ws = await employerService.documentWorkspace(broker, EMP_A, PY_2026);
    expect(ws.documents.length).toBeGreaterThan(0);

    const employee = await buildAuthContext("sub-employee-a"); // documents.read only
    await employerService.documentWorkspace(employee, EMP_A, PY_2026); // own-employer read allowed
    expect(employerService.uploadDocument(employee, EMP_A, PY_2026, "SBC", "nope.pdf")).rejects.toMatchObject({ name: "AuthError" });

    const adminB = await buildAuthContext("sub-emp-admin-b");
    expect(employerService.documentWorkspace(adminB, EMP_A, PY_2026)).rejects.toMatchObject({ name: "AuthError" });
  });
});
