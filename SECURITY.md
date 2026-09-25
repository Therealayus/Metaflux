# Security

- AES-256-GCM token encryption (`@socialflux/security`), API keys SHA-256 hashed.
- Secure cookies, CSRF where applicable, rate limiting, brute-force protection.
- Helmet headers, payload limits, SSRF guard for user URLs, webhook signature verification.
- RBAC + tenant isolation enforced server-side (`@socialflux/auth`).
- AI untrusted: structured output → validation → permission/policy → confirmation → execution.
- No secrets/tokens in logs (redacting logger) or frontend.
