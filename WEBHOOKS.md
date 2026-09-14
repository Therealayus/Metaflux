# Webhooks

Meta → gateway → signature verify → normalize → queue → processor → workflows → Meta API.
202 fast, work async. Idempotency on `eventId` unique constraint. Retries with
backoff + jitter, DLQ, replay from event viewer.
