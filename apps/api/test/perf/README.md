# Load test

Answers one question: **does a screen someone stares at all day stay fast when
the database is big?** It runs the real API against 400k orders / 120k
customers — not a mock, not a micro-benchmark.

```bash
bash apps/api/test/perf/run.sh                  # saturation: 25 concurrent, 300 req/endpoint
CONC=1 TOTAL=40 bash apps/api/test/perf/run.sh  # single user — what a person actually feels
```

Both forms also run the **write path** (`contention.mjs`) after the read
benchmark: `DRIVERS` drivers racing to accept the SAME order, `ORDERS` times
over. The integration suite proves that race correct once with two drivers;
this proves it still holds when a yard full of drivers all get the same socket
event and tap at once, which is the real pattern. The invariant per race is
exactly one 2xx and a clean 409 for everyone else — a second winner would mean
one delivery carrying two drivers' earnings snapshots. Measured on this box:
480 attempts over 40 races, 40 winners, 440 conflicts, no 5xx, accept p50 20ms.
It leaves those orders assigned, so it consumes PENDING rows from the seed.

The first run seeds `loadless_perf` (a few minutes); later runs reuse it. Drop
it with `docker exec loadless-postgres dropdb -U loadless loadless_perf`.

## Why the numbers move

Two defects this harness found that `EXPLAIN` alone did not:

- **`_count: { select: … }` is O(whole database).** Prisma compiles a relation
  count into a full-table `GROUP BY` per relation, joined to the page and
  limited *afterwards*. Rendering 20 admin rows aggregated every order, address
  and link on the platform: **1008ms p50, 19 rps**. Counting the page's own ids
  instead: **47ms, 511 rps**. Never use a relation `_count` on a paginated list.
- **`$transaction([a, b])` runs a and b in series on one connection.** For a
  page + its total, that consistency buys nothing and costs the sum of both
  latencies. `Promise.all` where the two results are not compared to each other.

## Baseline (single user, 400k orders)

| endpoint | p50 |
|---|---|
| customer 360 by phone (the mid-call screen) | 1.2 ms |
| driver feed | 2.0 ms |
| vendor orders | 3.3 ms |
| admin orders | 3.8 ms |
| admin customers | 11.3 ms |
| my customers (page) | 12.1 ms |
| my customers (search) | 27.7 ms |

A regression here means an index stopped being used — check with
`EXPLAIN (ANALYZE, BUFFERS)` before changing any query.
