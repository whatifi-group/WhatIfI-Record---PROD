CREATE TABLE "students" (
	"student_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "students_student_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 5000 CACHE 1),
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"home_address" text,
	"phone_number" text,
	"email_address" text
);
