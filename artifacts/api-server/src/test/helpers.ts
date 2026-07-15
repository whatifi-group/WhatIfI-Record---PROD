import express, { type IRouter } from "express";
import supertest from "supertest";
import {
  db,
  employeesTable,
  qualificationTypesTable,
  employeeQualificationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

/** Build a minimal Express app that mounts `router` at /api without auth. */
export function buildApp(router: IRouter) {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return supertest(app);
}

let counter = 0;

/** Insert a minimal employee into the DB and return its id. */
export async function createTestEmployee(): Promise<number> {
  const unique = `${Date.now()}-${++counter}`;
  const [emp] = await db
    .insert(employeesTable)
    .values({
      firstName: "Test",
      lastName: "Employee",
      email: `test-${unique}@example-test.invalid`,
      jobTitle: "Tester",
      employmentType: "full_time",
      startDate: "2024-01-01",
    })
    .returning({ id: employeesTable.id });
  return emp.id;
}

/** Delete the employee (cascades to all child records). */
export async function cleanupEmployee(id: number): Promise<void> {
  await db.delete(employeesTable).where(eq(employeesTable.id, id));
}

/** Insert a qualification type with no expiry and return its id. */
export async function createTestQualType(name?: string): Promise<number> {
  const unique = `${Date.now()}-${++counter}`;
  const [qt] = await db
    .insert(qualificationTypesTable)
    .values({ name: name ?? `Test Qual Type ${unique}` })
    .returning({ id: qualificationTypesTable.id });
  return qt.id;
}

/** Delete a qualification type by id. */
export async function cleanupQualType(id: number): Promise<void> {
  await db.delete(qualificationTypesTable).where(eq(qualificationTypesTable.id, id));
}

/** Insert an employee qualification directly with an explicit expiryDate. */
export async function createTestQualification(
  employeeId: number,
  qualTypeId: number,
  expiryDate: string | null,
): Promise<number> {
  const [q] = await db
    .insert(employeeQualificationsTable)
    .values({ employeeId, qualificationTypeId: qualTypeId, dateAchieved: "2020-01-01", expiryDate })
    .returning({ id: employeeQualificationsTable.id });
  return q.id;
}
