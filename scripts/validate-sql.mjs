// ============================================================================
// IRONMAP · scripts · validate-sql
// Sanity-checks every .sql file without a live Postgres: each '...'::jsonb
// literal must JSON.parse, and generated array/row counts are reported.
// `npm run check:sql`.
// ============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SQL = join(dirname(fileURLToPath(import.meta.url)), "..", "sql");
const files = readdirSync(SQL).filter((f) => f.endsWith(".sql")).sort();
let total = 0, bad = 0;

for (const f of files) {
  const sql = readFileSync(join(SQL, f), "utf8");
  const re = /'((?:[^']|'')*)'::jsonb/g;
  let m, nJson = 0;
  while ((m = re.exec(sql)) !== null) {
    nJson++; total++;
    try { JSON.parse(m[1].replace(/''/g, "'")); }
    catch (e) { bad++; console.log(`  ✗ ${f} jsonb #${nJson}: ${e.message}`); }
  }
  const inserts = (sql.match(/^insert into/gim) || []).length;
  console.log(`${f}: ${inserts} insert stmts · ${nJson} jsonb literals`);
}
console.log(`\n${bad === 0 ? "✅" : "❌"}  ${total} jsonb literals, ${bad} invalid`);
process.exit(bad === 0 ? 0 : 1);
