import express, { type IRouter } from "express";
import supertest from "supertest";
import { db, employeesTable } from "@workspace/db";
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
