-- Password reset tokens for the forgot-password flow
CREATE TABLE "password_reset_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "idx_prt_token" ON "password_reset_tokens" ("token");
CREATE INDEX "idx_prt_expires_at" ON "password_reset_tokens" ("expires_at");
