import { pgTable, integer, text } from "drizzle-orm/pg-core";

/**
 * Student register — person details for students enrolled on courses.
 * studentId is an identity column starting at 5000, not 1, to avoid
 * colliding with low IDs used elsewhere (e.g. employee/user IDs) if
 * records are ever cross-referenced by number in reports.
 */
export const studentsTable = pgTable("students", {
  studentId: integer("student_id")
    .primaryKey()
    .generatedAlwaysAsIdentity({ name: "students_student_id_seq", startWith: 5000 }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  homeAddress: text("home_address"),
  phoneNumber: text("phone_number"),
  emailAddress: text("email_address"),
});

export type Student = typeof studentsTable.$inferSelect;
export type InsertStudent = typeof studentsTable.$inferInsert;
