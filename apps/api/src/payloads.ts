import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Large webhook payloads live in object storage; small ones stay inline in the
 * event row. Threshold keeps Postgres rows lean while replay stays exact.
 */
export const INLINE_PAYLOAD_BYTES = 32 * 1024;
const MAX_VIEW_BYTES = 512 * 1024;

export interface PayloadStore {
  put(key: string, text: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

export class S3PayloadStore implements PayloadStore {
  private client: S3Client;
  constructor(
    private bucket: string,
    client?: S3Client,
  ) {
    this.client =
      client ??
      new S3Client({
        region: process.env.S3_REGION ?? "us-east-1",
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: Boolean(process.env.S3_ENDPOINT),
        credentials:
          process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
            ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }
            : undefined,
      });
  }

  async put(key: string, text: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: text, ContentType: "application/json" }));
  }

  async get(key: string): Promise<string | null> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!out.Body) return null;
    const text = await out.Body.transformToString();
    return text.length > MAX_VIEW_BYTES ? text.slice(0, MAX_VIEW_BYTES) : text;
  }
}

export function payloadStoreFromEnv(): PayloadStore | null {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;
  return new S3PayloadStore(bucket);
}

/** Decide inline vs S3. Returns the row fields to persist. */
export async function persistPayload(
  store: PayloadStore | null,
  organizationId: string,
  eventId: string,
  payload: unknown,
): Promise<{ inline?: unknown; ref?: string }> {
  const text = JSON.stringify(payload ?? {});
  if (store && Buffer.byteLength(text, "utf8") > INLINE_PAYLOAD_BYTES) {
    const key = `webhooks/${organizationId}/${eventId}.json`;
    await store.put(key, text);
    return { ref: `s3:${key}` };
  }
  return { inline: payload ?? {} };
}

/** Resolve a stored payload for the event viewer. */
export async function readPayload(
  store: PayloadStore | null,
  ref: string | null,
  inline: unknown,
): Promise<{ payload: unknown; truncated: boolean; storage: "inline" | "s3" }> {
  if (ref?.startsWith("s3:") && store) {
    const text = await store.get(ref.slice(3));
    if (text === null) return { payload: null, truncated: false, storage: "s3" };
    try {
      return { payload: JSON.parse(text), truncated: text.length >= MAX_VIEW_BYTES, storage: "s3" };
    } catch {
      return { payload: text, truncated: true, storage: "s3" };
    }
  }
  return { payload: inline ?? null, truncated: false, storage: "inline" };
}
