# Meta Integration

Boundaries live in `packages/meta`. Versions centralized in
`MetaApiVersionRegistry` (`META_GRAPH_API_VERSION`). Capabilities and
permissions are registry-driven — nothing hard-coded in app code.

If Meta approval blocks a capability, the UI must say so. Never fake Meta behavior.
