CREATE TABLE "employee_departments" (
	"employee_id" integer NOT NULL,
	"department_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_departments_employee_id_department_id_pk" PRIMARY KEY("employee_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "employee_departments" ADD CONSTRAINT "employee_departments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_departments" ADD CONSTRAINT "employee_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "employee_departments" ("employee_id", "department_id")
SELECT "id", "department_id" FROM "employees" WHERE "department_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "user_roles" ("user_id", "role_id")
SELECT "id", "role_id" FROM "users" WHERE "role_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" DROP CONSTRAINT "employees_department_id_departments_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "department_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role_id";--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"));
