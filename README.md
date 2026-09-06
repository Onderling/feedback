# onderling-feedback

Privacy-first community feedback. Participants speak freely — to a chat bot in the
[Basis](https://github.com/Onderling/basis) app or over Telegram — and what reaches the
organization is cleaned, anonymized, pseudonymous, and verifiable. The people being asked for
honesty keep control over exactly what leaves their device; the people asking get aggregated,
segmentable insight they can trust.

Built on the [Onderling platform](https://github.com/Onderling/basis) as its **first external
tenant**: this repo consumes the published `@onderling/*` packages like any third party would.

## How it protects participants

```
raw message  (participant's device / bot channel)
   │
   ▼  deterministic floor — regex + validators (@onderling/redaction)
strip phone · email · IBAN · BSN · postcode · URL · street+number  → [token]s
   │
   ▼  gazetteer — known first names → [naam]  (best-effort, by design not a guarantee)
   │
   ▼  language detect (NL/EN) → monolingual CLEAN prompt on a CONFIDENTIAL LLM
drop remaining names · remove insults aimed at people · keep severity and meaning
   │
   ▼  participant REVIEWS the cleaned text — consent is the hand-over
   │
   ▼  signed, pseudonymous contribution → central pod    (raw text never leaves the
      participant's own record; optional coarse background attributes ride along
      under the requested-attributes charter, k-anonymity-guarded at read)
   │
   ▼  aggregation → per-domain summaries → participant-verifiable summary loop
```

The ordering is the guarantee: structured identifiers are removed by **deterministic code**
(regex + checksum validators — the LLM never gets a chance to leak them), the LLM handles only
the fuzzy remainder, and the **participant sees and approves** what is shared before anything is
shared. Crisis signals are triaged out for escalation instead of being averaged into summaries.
Evidence, model comparisons, and adversarial stress-tests: [`docs/FINDINGS.md`](docs/FINDINGS.md),
[`docs/STRESS-TEST-RESULTS.md`](docs/STRESS-TEST-RESULTS.md).

## What's in here

| Area | What it does |
|---|---|
| `src/redact.js` · `src/names.js` · `src/floors/` | the deterministic anonymization floor |
| `src/pipeline.js` · `src/triage.js` · `src/prompt-profiles.js` | clean → label → per-domain summarize, per-model prompt profiles |
| `src/channel/` | the participant channels: Basis chat-bot, Telegram bot (HMAC pseudonyms), dispatcher, review/consent flow |
| `src/pod/` | contributions on Solid pods: participant's own pod, central pod, signing + verification, BYO-pod |
| `src/verify/` | the verify-summary loop — participants confirm the summary reflects their input |
| `src/aggregation/` · `src/curator/` | rounds, aggregation, the curator/PM portal (`scripts/portal.js`) |
| `src/mcp/` | an MCP server exposing the pipeline as a standard tool ([`docs/README-mcp.md`](docs/README-mcp.md)) |
| `src/tee/` | confidential-LLM transport ([`docs/CONFIDENTIAL-LLM-TRANSPORT.md`](docs/CONFIDENTIAL-LLM-TRANSPORT.md)) |
| `eval/` · `fixtures/` · `workflows/` | scenario generators + multi-agent adversarial evaluation |
| `deploy/` | docker-compose + Caddy for the service side |

## Bring it up

```bash
npm install
npm test                    # node:test — the full suite, no LLM required

# with a local model (Ollama):
npm run clean-smoke         # anonymization pass across candidate models
npm run full-pipeline       # end-to-end: clean → consent → pod → aggregate → summary

# the standard confidential route is Privatemode (docs/privatemode-models.md);
# LLM routes are configured in src/config/project-config.js
npm run llm-health          # is a model actually answering?

# channels + operations:
npm run basis-bot          # the live bot (Basis circles + Telegram)
npm run portal              # the project-lead portal
npm run mcp                 # the MCP tool server
```

Configuration knobs are catalogued in [`docs/parameters.md`](docs/parameters.md). **Never commit
`.env` files or run artifacts** (`results-*.md`, `portal-store.json`) — they are gitignored for a
reason.

## Run it on a box (the operator's side)

The monorepo's box runner (`deploy/box/` there) runs this repo as two roles from `deploy/roles/`
here: **`feedback-collect`** (activation service, the project lead's portal, one Telegram bot per
project — this half sees raw text, so it runs on our box or the customer's) and
**`feedback-aggregate`** (the scheduled aggregation + the transparency counts — the half a hosting
partner may run). Both build from `deploy/Dockerfile.box` and share one data volume.

A project is one command on the box:

```bash
node scripts/project.js new or-ziekenhuis --template or-feedback --name "OR Ziekenhuis X" --css-url http://pod:3000
node scripts/project.js list
node scripts/project.js run              # the bots (FP_TG_TOKEN_<ID> per project)
node scripts/project.js aggregate        # once; --every 86400 loops
```

`new` reserves the central pod on the CSS (owner credentials go to the secrets file, never printed),
registers the project in the portal store, mints invite codes and prints the links. Every project
config carries the **four levers** — `channels`, `participants.home`/`lifetime`, `botMode`, `output`
(`src/config/project-config.js` `LEVERS`); a value that is declared but not built yet is refused with
"not yet", so a template for a later direction (`templates/`) can already say what it wants.

## Relation to the platform

Depends on `@onderling/{core, pod-client, pseudo-pod, redaction, attribute-charter}` —
[published on npm](https://github.com/Onderling/basis/blob/master/docs/packages.md). *Interim:*
this checkout still uses local `file:../canopy-mono/*` links; they swap to registry versions as
the post-split tail completes ([`docs/POST-SPLIT.md`](docs/POST-SPLIT.md)). The Basis app hosts
the feedback bot through this repo's public surface (`src/public/`, importable as
`onderling-feedback/public` + `/testing`).

## Status (2026-07)

Working and **proven live end-to-end**: a real Telegram bot → confidential LLM (Privatemode)
→ real Solid central pod, with HMAC pseudonyms, review-and-consent, own-pod raw retention
(participant-controlled), the requested-attributes charter (coarse, capped, k-anonymity-guarded),
and the verify-summary loop — 304 tests green. The remaining work is finishing polish (prompt-
candidate adoption, logging slice, onboarding surfaces) and operational hardening; the app is a
research preview, not yet a hosted service.

## Security

Vulnerability reports: **security@onderling.org** (coordinated disclosure — please no public
issues for vulnerabilities). The threat model and storage/encryption choices are documented in
[`docs/SECURITY-MODEL.md`](docs/SECURITY-MODEL.md) and
[`docs/POD-ENCRYPTION-MODEL.md`](docs/POD-ENCRYPTION-MODEL.md).

## Name history

Developed as `apps/feedback-pipeline` inside the former `canopy-mono` monorepo; carved into this
repository (July 2026) with full history. License: Apache-2.0.
