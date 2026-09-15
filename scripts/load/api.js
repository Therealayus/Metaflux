/*
 * k6 load profile for staging/production-like environments.
 * Install k6 (https://k6.io/docs/get-started/installation/), then:
 *   API_BASE=http://localhost:4000 k6 run scripts/load/api.js
 *
 * Thresholds encode the scale target: p95 < 500ms for reads at 100 RPS,
 * error rate < 1%. Tune VUs for the environment under test.
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 100 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

const BASE = __ENV.API_BASE || "http://localhost:4000";
const HEADERS = { "Content-Type": "application/json", "x-user-id": "load", "x-org-id": "load-org" };

export default function () {
  const health = http.get(`${BASE}/api/v1/health`);
  check(health, { "health 200": (r) => r.status === 200 });

  const caps = http.get(`${BASE}/api/v1/capabilities`);
  check(caps, { "capabilities 200": (r) => r.status === 200 });

  const plan = http.post(
    `${BASE}/api/v1/ai/plan`,
    JSON.stringify({ prompt: "k6 load probe: comment to DM automation" }),
    { headers: HEADERS },
  );
  check(plan, { "plan 200|429": (r) => r.status === 200 || r.status === 429 });

  sleep(0.2);
}
