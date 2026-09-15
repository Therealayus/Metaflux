/**
 * Runnable load probe (node, no extra tooling). Hammers the API the way the
 * platform really serves it and reports latency percentiles + error rate.
 *
 * Usage:
 *   STORE_DRIVER=memory QUEUE_DRIVER=memory API_PORT=4100 node dist/index.js &
 *   node scripts/load/probe.mjs --base http://127.0.0.1:4100 --rps 50 --seconds 20
 */
const rawArgs = process.argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (!a.startsWith("--")) continue;
  const eq = a.indexOf("=");
  if (eq !== -1) {
    args[a.slice(2, eq)] = a.slice(eq + 1);
  } else {
    const next = rawArgs[i + 1];
    if (next && !next.startsWith("--")) {
      args[a.slice(2)] = next;
      i += 1;
    } else {
      args[a.slice(2)] = "true";
    }
  }
}

const BASE = args.base ?? "http://127.0.0.1:4000";
const RPS = Number(args.rps ?? 20);
const SECONDS = Number(args.seconds ?? 10);
const HEADERS = { "x-user-id": "load", "x-org-id": "load-org" };

const routes = [
  { method: "GET", path: "/api/v1/health" },
  { method: "GET", path: "/api/v1/capabilities" },
  { method: "GET", path: "/api/v1/ai/usage", headers: HEADERS },
  { method: "POST", path: "/api/v1/ai/plan", headers: HEADERS, body: { prompt: "Load test probe plan request" } },
];

const latencies = [];
let errors = 0;
let total = 0;
const deadline = Date.now() + SECONDS * 1000;

async function worker() {
  while (Date.now() < deadline) {
    const r = routes[Math.floor(Math.random() * routes.length)];
    const started = Date.now();
    try {
      const res = await fetch(`${BASE}${r.path}`, {
        method: r.method,
        headers: { "Content-Type": "application/json", ...(r.headers ?? {}) },
        body: r.body ? JSON.stringify(r.body) : undefined,
      });
      await res.text().catch(() => "");
      if (!res.ok && res.status !== 429) errors += 1;
      if (res.status === 429) errors += 1;
      total += 1;
      latencies.push(Date.now() - started);
    } catch {
      errors += 1;
      total += 1;
    }
    const interval = 1000 / (RPS / 4);
    await new Promise((res2) => setTimeout(res2, interval));
  }
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

await Promise.all([worker(), worker(), worker(), worker()]);
latencies.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      base: BASE,
      targetRps: RPS,
      seconds: SECONDS,
      requests: total,
      errors,
      errorRate: total ? errors / total : 0,
      p50Ms: pct(latencies, 50),
      p95Ms: pct(latencies, 95),
      p99Ms: pct(latencies, 99),
      verdict: errors / Math.max(total, 1) > 0.01 || pct(latencies, 95) > 1000 ? "FAIL" : "PASS",
    },
    null,
    2,
  ),
);
if (errors / Math.max(total, 1) > 0.01 || pct(latencies, 95) > 1000) process.exit(1);
