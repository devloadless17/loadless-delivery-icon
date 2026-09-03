/**
 * Write-path load test: the accept race, under sustained pressure.
 *
 * The integration suite proves the race is correct ONCE, with two drivers. The
 * guarantee that actually matters in production is that it still holds when a
 * feed of new orders hits a yard full of drivers at the same moment — a real
 * pattern here, because every on-duty driver gets the same socket event and
 * they all tap at once.
 *
 * The invariant, per order: exactly one 2xx, every other attempt a clean 409.
 * A second winner means an order was handed to two drivers, each with their own
 * earnings snapshot. A 500 means the guard fell over rather than refusing.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const SECRET = 'perf-test-secret-at-least-32-characters-long';
const BASE = { host: '127.0.0.1', port: 4290 };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (c) => {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...c, iat: now, exp: now + 3600 })}`;
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
};

const DRIVERS = Number(process.env.DRIVERS ?? 12); // how many race each order
// The feed caps `limit` at 50 — a real validation rule, not a knob to widen.
const ORDERS = Math.min(Number(process.env.ORDERS ?? 40), 50); // how many races to run
const tokens = Array.from({ length: DRIVERS }, (_, i) =>
  sign({ sub: `u-d-${i + 1}`, role: 'DRIVER', tv: 0, did: `d-${i + 1}` }),
);

function call(method, path, token) {
  return new Promise((resolve) => {
    const t = process.hrtime.bigint();
    const req = http.request({ ...BASE, method, path, headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () =>
        resolve({ ms: Number(process.hrtime.bigint() - t) / 1e6, status: res.statusCode, body }),
      );
    });
    req.on('error', (e) => resolve({ ms: -1, status: 0, body: String(e) }));
    req.end();
  });
}

const feed = await call('GET', `/api/v1/driver/orders/available?limit=${ORDERS}`, tokens[0]);
if (feed.status !== 200) {
  console.error(`could not read the feed: ${feed.status} ${feed.body.slice(0, 200)}`);
  process.exit(1);
}
const ids = (JSON.parse(feed.body).data ?? []).map((o) => o.id);
if (ids.length === 0) {
  console.error('no PENDING orders left in the perf database — reseed it');
  process.exit(1);
}

console.log(`\ncontention: ${ids.length} orders, ${DRIVERS} drivers racing each one\n`);

let doubleWins = 0, noWinner = 0, serverErrors = 0, conflicts = 0, wins = 0;
const latencies = [];
const otherCodes = new Map();

for (const id of ids) {
  // All DRIVERS fire at the same instant for the SAME order.
  const rs = await Promise.all(tokens.map((tk) => call('POST', `/api/v1/driver/orders/${id}/accept`, tk)));
  rs.forEach((r) => r.ms >= 0 && latencies.push(r.ms));
  const ok = rs.filter((r) => r.status >= 200 && r.status < 300).length;
  const c409 = rs.filter((r) => r.status === 409).length;
  const e5xx = rs.filter((r) => r.status >= 500).length;
  rs.filter((r) => !(r.status >= 200 && r.status < 300) && r.status !== 409)
    .forEach((r) => otherCodes.set(r.status, (otherCodes.get(r.status) ?? 0) + 1));
  wins += ok; conflicts += c409; serverErrors += e5xx;
  if (ok > 1) doubleWins += 1;
  if (ok === 0) noWinner += 1;
}

latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((latencies.length * p) / 100))] ?? 0;
const attempts = ids.length * DRIVERS;

console.log(`attempts            ${attempts}`);
console.log(`winners             ${wins}   (expected ${ids.length} — exactly one per order)`);
console.log(`clean 409 conflicts ${conflicts}`);
if (otherCodes.size) console.log(`other statuses      ${[...otherCodes].map(([s, n]) => `${s}×${n}`).join(', ')}`);
console.log(`accept latency      p50 ${pct(50).toFixed(1)}ms  p95 ${pct(95).toFixed(1)}ms  p99 ${pct(99).toFixed(1)}ms`);
console.log('');

const problems = [];
if (doubleWins) problems.push(`${doubleWins} order(s) accepted by MORE THAN ONE driver`);
if (noWinner) problems.push(`${noWinner} order(s) nobody won`);
if (serverErrors) problems.push(`${serverErrors} server error(s) — the guard threw instead of refusing`);
if (problems.length) {
  console.error('FAILED:\n  - ' + problems.join('\n  - ') + '\n');
  process.exit(1);
}
console.log(`PASS: every one of the ${ids.length} races had exactly one winner; the rest refused cleanly.\n`);
