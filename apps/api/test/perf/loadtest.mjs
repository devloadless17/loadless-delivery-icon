/**
 * Load test against the real API + a 400k-order database.
 * No deps: plain http with a fixed concurrency pool, reporting p50/p95/p99.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const SECRET = 'perf-test-secret-at-least-32-characters-long';
const BASE = { host: '127.0.0.1', port: 4290 };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
// HS256 by hand: jsonwebtoken is a transitive dep and pnpm does not hoist it.
const sign = (claims) => {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...claims, iat: now, exp: now + 3600 })}`;
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
};

const vendorToken = sign({ sub: 'u-v-7', role: 'VENDOR', tv: 0, vid: 'v-7' });
const adminToken = sign({ sub: 'u-v-1', role: 'ADMIN', tv: 0 });
const driverToken = sign({ sub: 'u-d-3', role: 'DRIVER', tv: 0, did: 'd-3' });

function once(path, token) {
  return new Promise((resolve) => {
    const t = process.hrtime.bigint();
    const req = http.request(
      { ...BASE, path, headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let n = 0;
        res.on('data', (c) => (n += c.length));
        res.on('end', () =>
          resolve({ ms: Number(process.hrtime.bigint() - t) / 1e6, status: res.statusCode, bytes: n }),
        );
      },
    );
    req.on('error', () => resolve({ ms: -1, status: 0, bytes: 0 }));
    req.end();
  });
}

const CONC = Number(process.env.CONC ?? 25);
const TOTAL = Number(process.env.TOTAL ?? 300);
async function bench(name, path, token, { total = TOTAL, concurrency = CONC } = {}) {
  await once(path, token); // warm
  const results = [];
  let issued = 0;
  const worker = async () => {
    while (issued < total) {
      issued += 1;
      results.push(await once(path, token));
    }
  };
  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const wall = Date.now() - started;

  const ok = results.filter((r) => r.status >= 200 && r.status < 300);
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor((times.length * p) / 100))] ?? 0;
  const bad = results.filter((r) => r.status < 200 || r.status >= 300);
  console.log(
    `${name.padEnd(38)} ` +
      `p50 ${pct(50).toFixed(1).padStart(7)}ms  p95 ${pct(95).toFixed(1).padStart(7)}ms  ` +
      `p99 ${pct(99).toFixed(1).padStart(7)}ms  ${Math.round((ok.length / wall) * 1000).toString().padStart(5)} rps  ` +
      `${(ok[0]?.bytes / 1024 || 0).toFixed(1).padStart(6)} KB` +
      (bad.length ? `  ⚠ ${bad.length} non-2xx (${bad[0].status})` : ''),
  );
}

console.log(`\nconcurrency ${CONC}, ${TOTAL} requests each — 400k orders / 120k customers\n`);
await bench('vendor orders (All tab)', '/api/v1/vendor/orders?limit=15', vendorToken);
await bench('vendor orders (PENDING tab)', '/api/v1/vendor/orders?limit=15&status=PENDING', vendorToken);
await bench('vendor my-customers (page 1)', '/api/v1/vendor/customers?page=1&limit=10', vendorToken);
await bench('vendor my-customers (name search)', '/api/v1/vendor/customers?page=1&limit=10&q=ahmad', vendorToken);
await bench('vendor my-customers (phone search)', '/api/v1/vendor/customers?page=1&limit=10&q=03%2030012', vendorToken);
await bench('customer 360 by phone', '/api/v1/customers?phone=%2B9613000500', vendorToken);
await bench('driver feed', '/api/v1/driver/orders/available?limit=15', driverToken);
await bench('driver active', '/api/v1/driver/orders?scope=active&limit=15', driverToken);
await bench('admin orders', '/api/v1/admin/orders?limit=20', adminToken);
await bench('admin customers', '/api/v1/admin/customers?page=1&limit=20', adminToken);
await bench('admin customers (name search)', '/api/v1/admin/customers?page=1&limit=20&q=ahmad', adminToken);
console.log('');
