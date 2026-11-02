// Presupuesto de tamaño (constitución, restricciones técnicas): JS + CSS iniciales ≤ 100 KB gzip.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = 100 * 1024;
const dir = process.argv[2] ?? 'dist/assets';

if (!existsSync(dir)) {
  console.error(`No existe ${dir}. Ejecuta antes "npm run build".`);
  process.exit(1);
}

const files = readdirSync(dir).filter((f) => /\.(js|css)$/.test(f));
let total = 0;
const rows = files.map((f) => {
  const raw = readFileSync(join(dir, f));
  const gz = gzipSync(raw, { level: 9 }).length;
  total += gz;
  return { archivo: f, bytes: raw.length, gzip: gz };
});

console.table(rows);
const pct = ((total / BUDGET) * 100).toFixed(1);
console.log(`Total gzip: ${total} bytes (${pct} % de ${BUDGET} bytes)`);

if (total > BUDGET) {
  console.error('❌ Se supera el presupuesto de 100 KB.');
  process.exit(1);
}
console.log('✅ Dentro del presupuesto.');
