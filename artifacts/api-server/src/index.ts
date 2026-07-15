import app from "./app";
import { logger } from "./lib/logger";
import { seedLov } from "./lib/seedLov";
import { seedRoles } from "./lib/seedRoles";
import { runMigrations } from "@workspace/db";
import path from "path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// __dirname is injected by esbuild banner and points to the dist/ directory.
// The build step copies lib/db/drizzle/ → dist/drizzle/ so migrations are
// always co-located with the compiled bundle.
const migrationsFolder = path.join(__dirname, "drizzle");

runMigrations(migrationsFolder)
  .then(() => {
    logger.info("Database migrations applied");
    return Promise.all([seedLov(), seedRoles()]);
  })
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup failed — aborting");
    process.exit(1);
  });
