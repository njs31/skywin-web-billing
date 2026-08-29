import { readFileSync } from "fs";
import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: tsx scripts/run-sql-file.ts <path.sql>");
  const raw = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const statements = raw
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    console.log("->", stmt.replace(/\s+/g, " ").slice(0, 90));
    await db.execute(sql.raw(stmt));
  }
  console.log(`applied ${statements.length} statements from ${file}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
