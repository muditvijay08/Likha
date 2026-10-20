// Every table, function and storage bucket the app calls must exist in the database schema.
// Usage: node scripts/check-db-calls.mjs ../schema/likha_schema.sql
import { readFileSync } from "node:fs";
const schema = readFileSync(process.argv[2] ?? "../schema/likha_schema.sql", "utf8").toLowerCase();
const code = readFileSync(new URL("../src/lib/api/supabase.ts", import.meta.url), "utf8");
let bad = 0, n = 0;
const check = (kind, name, re) => { n++; if (!re.test(schema)) { bad++; console.log(`MISSING ${kind}: ${name}`); } };
for (const [, f] of code.matchAll(/\.rpc\("([a-z_]+)"/g)) check("function", f, new RegExp(`function public\\.${f}\\(`));
for (const [, t] of code.matchAll(/\.from\("([a-z_]+)"\)/g)) {
  if (code.includes(`storage.from("${t}")`)) check("bucket", t, new RegExp(`\\('${t}'`));
  else check("table", t, new RegExp(`create table public\\.${t} `));
}
for (const [, fn] of code.matchAll(/functions\.invoke\("([a-z-]+)"/g)) console.log(`NOTE edge function needed: ${fn}`);
console.log(`${n - bad} of ${n} database names found${bad ? `, ${bad} missing` : ""}`);
process.exit(bad ? 1 : 0);
