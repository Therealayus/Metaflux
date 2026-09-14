# Project Rules

- Git identity: ALWAYS use `Ayush Gupta / ayushgupta2429@gmail.com` (repo-local config).
  NEVER change the global git identity — leave it untouched.
- SSH: push/pull via the `github-there` host alias (Therealayus account key).
- Stack: pnpm workspaces + Turborepo modular monolith (web/api/worker + packages).
- Strict TypeScript: no `any` unless justified, typed errors, structured logging.
- Tenant isolation: never trust org/workspace IDs from the client; derive from session.
- AI layer is untrusted: LLM -> structured output -> schema validation -> permission/policy check -> user confirmation -> execution. Never LLM -> arbitrary API call.
- Never log secrets/tokens. Never expose provider secrets to the frontend.
- Never claim something is implemented if it is only mocked.
