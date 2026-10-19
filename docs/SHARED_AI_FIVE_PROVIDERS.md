# Shared AI Gateway — CRM, Argoplace, MIRA, Orquestra

## Status and boundaries
This is a **reusable, disabled-by-default deployment blueprint**, NOT five active paid provider connections. The repository owns the reference gateway configuration at `infra/litellm/config.example.yaml`. The existing CRM inference client (`src/lib/server/platform/ai/gateway.ts`) already accepts `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL`; it must not own upstream provider secrets.

The Argoplace + MIRA client is separate; Orquestra's **existing Codex/Claude subscription-only executor remains unchanged**. A new inference route must never be confused with or added as a fallback to the coding CLI/OAuth executor.

## Providers and model aliases
Provider groups: `provider-gemini`, `provider-openai`, `provider-claude`, `provider-groq`, `provider-grok`.

Application groups: `crm-default`, `crm-fast`, `mira-consultive`, `mira-fast`, `argoplace-analyst`, `orquestra-research`. Each has bounded cross-provider fallbacks. These are aliases, not a guarantee that a provider is purchased, authorized or online. Check the actual /v1/models catalog and upstream model entitlements before real calls.

## Activation sequence (no invented credentials)
1. Create an isolated **gateway-only** PostgreSQL database. Do not reuse CRM, Argoplace, Orquestra or Supabase production domain databases. This is mandatory for virtual keys and enforceable spend budgets.
2. In the gateway's secret store set `DATABASE_URL`, `LITELLM_MASTER_KEY` (long random admin key), `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`. Never place these in application repos or `NEXT_PUBLIC_*` variables. **Never ask users to paste API keys in chat.**
3. Deploy a reviewed/pinned LiteLLM version with this config from an isolated private service. Set TLS, no unauthenticated access, restrictive ingress. No service has been created as part of this config-only change.
4. Create **distinct virtual keys** for CRM, Argoplace/MIRA and Orquestra research, scoped to their approved model groups, requests-per-minute and monthly dollar budgets. Do not share the master key or give it to clients. Without PostgreSQL budgets may fail open; do not enable paid requests in that state.
5. CRM server env: `AI_GATEWAY_BASE_URL=https://<gateway-host>`, `AI_GATEWAY_API_KEY=<crm-virtual-key>`, `AI_GATEWAY_MODEL=crm-default`, `AI_GATEWAY_TIMEOUT_MS=12000`.
6. Argoplace/MIRA server env: `AI_SHARED_GATEWAY_ENABLED=true`, `AI_SHARED_GATEWAY_BASE_URL=https://<gateway-host>`, `AI_SHARED_GATEWAY_API_KEY=<argoplace-virtual-key>` (only after explicit test). Existing MIRA Claude/Gemini/Groq/NVIDIA routing continues unchanged until a deliberate feature rollout.
7. Orquestra research-only adapter: optional, isolated, disabled by default; no keys in its local subscription executor. Never use it for unattended merges/deploys.
8. Validate read-only smoke checks with small token limits, provider status/latency and costs, then enable one product at a time; keep all outbound customer sends/human approvals and fiscal gates unchanged.

## Latency and spend
- Client timeouts 8–12 seconds for interactive tasks; no per-request infinite retry; route fallback at gateway layer.
- Limits MUST be enforced by virtual keys with Postgres, not an approximate front-end counter. Set hard per-app budgets before activating.
- Log model, latency, token counts, status; no message text/PII by default.
- Never auto-send WhatsApp, publish listings, change orders/fiscal or approve an Orquestra mission because a model returned text.
- If no provider is authorized or all quotas are exhausted, fail closed or use a clearly labeled deterministic fallback. Do not invent successful inference.

Useful references:
- https://docs.litellm.ai/docs/proxy/virtual_keys
- https://docs.litellm.ai/docs/proxy/users
- https://docs.litellm.ai/docs/routing
