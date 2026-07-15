import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requireAuth } from "./middlewares/requireAuth";
import "./types/session.d.ts";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET env var is required");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL env var is required");
}

const PgSession = connectPgSimple(session);

const app: Express = express();

// Trust the first proxy hop — required for secure cookies and correct
// client-IP detection behind Replit's autoscale reverse proxy.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.text({ type: ["text/plain", "text/csv"], limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "user_sessions",
      // Table is created by DB migration 0004_user_sessions.sql —
      // do NOT use createTableIfMissing here because it reads a bundled
      // table.sql that esbuild does not copy into dist/.
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // Require HTTPS in production so the cookie is only sent over encrypted
      // connections; allow HTTP in development for curl / local testing.
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

// Auth guard — runs before all API routes
app.use("/api", requireAuth);
app.use("/api", router);

export default app;
