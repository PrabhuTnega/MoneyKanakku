/**
 * The API has no Prisma schema or generated client of its own — it imports
 * the one already built and tested in ../db, so there is exactly one
 * schema, one migration history, and one PrismaClient/driver-adapter setup
 * for the whole project. This is a plain relative import across sibling
 * package folders (deliberately not an npm workspace): Node resolves each
 * file's own bare-specifier imports (e.g. `@prisma/adapter-pg` inside
 * db/prisma/client.ts) starting from that file's location on disk, so
 * db/node_modules is found correctly even though api/ has its own
 * separate node_modules for its own dependencies (Express, zod, ...).
 */ 
export { prisma } from "../../../db/prisma/client.js";
export * from "../../../db/generated/prisma/index.js";
export type * from "../../../db/generated/prisma/index.js";
