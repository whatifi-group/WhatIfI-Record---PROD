/**
 * Directory endpoint — pay-rate field exclusion tests.
 *
 * Verifies that GET /api/directory and GET /api/directory/:id never expose
 * salary, pay rate, or payroll-adjacent fields, even when the underlying
 * employee record has a salary value.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import directoryRouter from "../routes/directory";
import {
  buildApp,
  cleanupEmployee,
  cleanupRole,
  cleanupUser,
  createTestRole,
  createTestUser,
} from "./helpers";
import { db, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── File-level fixtures ───────────────────────────────────────────────────────

let roleId: number;
let userId: number;
let empId: number;

beforeAll(async () => {
  roleId = await createTestRole(["view_employee_directory"]);
  userId = await createTestUser(roleId);

  // Employee with a salary set — the directory endpoint must not expose it
  const [emp] = await db
    .insert(employeesTable)
    .values({
      firstName: "Dir",
      lastName: "Test",
      email: `dir-test-${Date.now()}@example-test.invalid`,
      jobTitle: "Director",
      employmentType: "full_time",
      startDate: "2024-01-01",
      salary: "95000",
      status: "active",
    })
    .returning({ id: employeesTable.id });
  empId = emp.id;
});

afterAll(async () => {
  await cleanupEmployee(empId);
  await cleanupUser(userId);
  await cleanupRole(roleId);
});

// ── GET /api/directory ────────────────────────────────────────────────────────

describe("GET /api/directory — field exclusions", () => {
  it("returns 200 and an array", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get("/api/directory");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("includes the test employee in the list", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get("/api/directory");
    const row = (res.body as Array<{ id: number }>).find((r) => r.id === empId);
    expect(row).toBeDefined();
  });

  it("does NOT include salary in any row", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get("/api/directory");
    for (const row of res.body as Array<Record<string, unknown>>) {
      expect(row).not.toHaveProperty("salary");
    }
  });

  it("does NOT include payRate, hourlyRate, or employeePayRates in any row", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get("/api/directory");
    for (const row of res.body as Array<Record<string, unknown>>) {
      expect(row).not.toHaveProperty("payRate");
      expect(row).not.toHaveProperty("hourlyRate");
      expect(row).not.toHaveProperty("employeePayRates");
    }
  });

  it("includes only the safe fields (id, firstName, lastName, jobTitle, email, phone)", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get("/api/directory");
    const row = (res.body as Array<{ id: number }>).find((r) => r.id === empId);
    expect(row).toBeDefined();
    const keys = Object.keys(row!).sort();
    expect(keys).toEqual(["email", "firstName", "id", "jobTitle", "lastName", "phone"].sort());
  });

  it("returns 403 when user lacks view_employee_directory permission", async () => {
    const noPermRoleId = await createTestRole(["view_employees"]);
    const noPermUserId = await createTestUser(noPermRoleId);
    try {
      const api = buildApp(directoryRouter, noPermUserId);
      const res = await api.get("/api/directory");
      expect(res.status).toBe(403);
    } finally {
      await cleanupUser(noPermUserId);
      await cleanupRole(noPermRoleId);
    }
  });
});

// ── GET /api/directory/:employeeId ────────────────────────────────────────────

describe("GET /api/directory/:employeeId — field exclusions", () => {
  it("returns 200 with employee data", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get(`/api/directory/${empId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(empId);
  });

  it("does NOT include salary in the response", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get(`/api/directory/${empId}`);
    expect(res.body).not.toHaveProperty("salary");
  });

  it("does NOT include payRate, hourlyRate, or employeePayRates", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get(`/api/directory/${empId}`);
    expect(res.body).not.toHaveProperty("payRate");
    expect(res.body).not.toHaveProperty("hourlyRate");
    expect(res.body).not.toHaveProperty("employeePayRates");
  });

  it("includes safe employee fields plus nextOfKin and qualifications arrays", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get(`/api/directory/${empId}`);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("firstName");
    expect(res.body).toHaveProperty("lastName");
    expect(res.body).toHaveProperty("jobTitle");
    expect(res.body).toHaveProperty("email");
    expect(res.body).toHaveProperty("nextOfKin");
    expect(res.body).toHaveProperty("qualifications");
    expect(Array.isArray(res.body.nextOfKin)).toBe(true);
    expect(Array.isArray(res.body.qualifications)).toBe(true);
  });

  it("returns 404 for a non-existent employee", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get("/api/directory/999999999");
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric id", async () => {
    const api = buildApp(directoryRouter, userId);
    const res = await api.get("/api/directory/abc");
    expect(res.status).toBe(400);
  });
});
