/**
 * Minimal Prometheus-compatible metrics registry. No dependencies, safe to
 * import anywhere. Scrape via GET /api/v1/metrics.
 */

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(",");
}

function renderLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

class Counter {
  private values = new Map<string, { labels: Labels; value: number }>();
  constructor(private name: string, private help: string) {}
  inc(labels: Labels = {}, by = 1): void {
    const key = labelKey(labels);
    const cur = this.values.get(key) ?? { labels, value: 0 };
    cur.value += by;
    this.values.set(key, cur);
  }
  render(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} counter\n`;
    for (const { labels, value } of this.values.values()) {
      out += `${this.name}${renderLabels(labels)} ${value}\n`;
    }
    return out;
  }
}

class Gauge {
  private values = new Map<string, { labels: Labels; value: number }>();
  constructor(private name: string, private help: string) {}
  set(value: number, labels: Labels = {}): void {
    this.values.set(labelKey(labels), { labels, value });
  }
  render(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} gauge\n`;
    for (const { labels, value } of this.values.values()) {
      out += `${this.name}${renderLabels(labels)} ${value}\n`;
    }
    return out;
  }
}

class Histogram {
  private sums = new Map<string, { labels: Labels; sum: number; count: number; buckets: number[] }>();
  constructor(private name: string, private help: string, private bounds: number[] = [25, 100, 250, 500, 1000, 2500]) {}
  observe(value: number, labels: Labels = {}): void {
    const key = labelKey(labels);
    const cur = this.sums.get(key) ?? { labels, sum: 0, count: 0, buckets: this.bounds.map(() => 0) };
    cur.sum += value;
    cur.count += 1;
    cur.buckets = cur.buckets.map((c, i) => c + (value <= (this.bounds[i] as number) ? 1 : 0));
    this.sums.set(key, cur);
  }
  render(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} histogram\n`;
    for (const { labels, sum, count, buckets } of this.sums.values()) {
      buckets.forEach((c, i) => {
        out += `${this.name}_bucket${renderLabels({ ...labels, le: String(this.bounds[i]) })} ${c}\n`;
      });
      out += `${this.name}_bucket${renderLabels({ ...labels, le: "+Inf" })} ${count}\n`;
      out += `${this.name}_sum${renderLabels(labels)} ${sum}\n`;
      out += `${this.name}_count${renderLabels(labels)} ${count}\n`;
    }
    return out;
  }
}

export const metrics = {
  httpRequests: new Counter("metaflux_http_requests_total", "API requests by route, method and status"),
  httpLatency: new Histogram("metaflux_http_latency_ms", "API latency in milliseconds"),
  webhookEvents: new Counter("metaflux_webhook_events_total", "Webhook events by product and outcome"),
  workflowExecutions: new Counter("metaflux_workflow_executions_total", "Workflow executions by status"),
  jobs: new Counter("metaflux_jobs_total", "Queue jobs by name and outcome"),
  aiSpendCents: new Counter("metaflux_ai_spend_cents_total", "AI spend in USD cents by org and model"),
  queueDepth: new Gauge("metaflux_queue_depth", "Jobs waiting in the queue"),
  dlqDepth: new Gauge("metaflux_dlq_depth", "Jobs in the dead-letter queue"),
};

export function renderMetrics(): string {
  return [
    metrics.httpRequests.render(),
    metrics.httpLatency.render(),
    metrics.webhookEvents.render(),
    metrics.workflowExecutions.render(),
    metrics.jobs.render(),
    metrics.aiSpendCents.render(),
    metrics.queueDepth.render(),
    metrics.dlqDepth.render(),
  ].join("");
}

/** Normalize a URL path for cardinality-safe metrics (ids -> :id). */
export function routeOf(path: string): string {
  const clean = (path.split("?")[0] ?? path).split("#")[0] ?? path;
  return clean
    .split("/")
    .map((seg) => {
      if (/^\d+$/.test(seg)) return ":id";
      if (seg.length >= 8 && /[0-9_-]/.test(seg)) return ":id";
      return seg;
    })
    .join("/");
}
