import fs from "node:fs";
import path from "node:path";

const source = path.resolve(process.cwd(), "../db/generated");
const destination = path.resolve(process.cwd(), "dist/db/generated");

fs.cpSync(source, destination, { recursive: true });

console.log("Prisma generated client copied successfully."); 