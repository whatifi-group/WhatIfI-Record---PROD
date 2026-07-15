-- Add employee link and system-account flag to users
ALTER TABLE "users" ADD COLUMN "is_system_account" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "employee_id" integer;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_unique" UNIQUE("employee_id");
--> statement-breakpoint
-- All existing users have no employee link; mark them as system accounts
UPDATE "users" SET "is_system_account" = true WHERE "employee_id" IS NULL;
