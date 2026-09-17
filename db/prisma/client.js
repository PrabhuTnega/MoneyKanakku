/**
 * Shared PrismaClient factory.
 *
 * Prisma 7 removed the implicit "connect straight from DATABASE_URL"
 * behaviour — a driver adapter must be passed explicitly now. This is the
 * one place that wiring happens so the seed script and the API layer
 * (../../api, a sibling package that imports this file directly) both
 * connect the same way.
 *
 * dotenv's bare `import "dotenv/config"` resolves `.env` relative to
 * `process.cwd()` — fine when a script is run from inside db/, but wrong
 * the moment a different working directory imports this module (exactly
 * what the API does when its dev server is started from api/). Loading
 * `.env` relative to *this file's own location* instead makes it correct
 * regardless of who imports it or from where.
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(here, "..", ".env") });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is not set — copy db/.env.example to db/.env first.");
}
const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });
//# sourceMappingURL=client.js.map