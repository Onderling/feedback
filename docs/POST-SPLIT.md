# Post-split TODO (carved 2026-07-16 from Onderling/basis @ c8772e08)

Re-carved from the CONSOLIDATED master (property-layer + feedback-live + tg-hardening merged
first — the 2026-07-09 carve predated the live-TG hardening and the charter work). 104 commits.

1. **Publish swap** — the five `@onderling/*` deps are interim `file:../canopy-mono/*` links.
   When the SDK publishes (see basis repo, `plans/PLAN-sdk-publishing.md`), swap to versioned
   deps and commit the regenerated lockfile. The scope rename (`@onderling/*` → `@onderling/*`)
   lands together with that swap.
2. ✅ **DONE 2026-07-16 — basis is feedback-free** (basis `97da876a` + `29ac1a2a`): canopy-chat
   (+ mobile, + the e2e-journeys) consume THIS repo via an interim `link:`/relative dep on the
   sibling checkout; the barrel grew `buildContribution` + the signing trio, and `./testing`
   exports the mock-LLM. Replaced by versioned deps at the publish swap (step 1).
3. **Codeberg mirror** — set up the pull-mirror once the org's Codeberg account exists.

Carve invariants (also honoured 2026-07-09): history scrubbed of `results-*.md` +
`portal-store.json`; `test/contact-thread-e2e.test.js` excluded (needs the canopy-chat host —
it lives on that side); interim lockfile gitignored until the publish swap.
