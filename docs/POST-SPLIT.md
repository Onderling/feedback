# Post-split TODO (carved 2026-07-16 from Onderling/basis @ c8772e08)

Re-carved from the CONSOLIDATED master (property-layer + feedback-live + tg-hardening merged
first — the 2026-07-09 carve predated the live-TG hardening and the charter work). 104 commits.

1. **Publish swap** — the five `@canopy/*` deps are interim `file:../canopy-mono/*` links.
   When the SDK publishes (see basis repo, `plans/PLAN-sdk-publishing.md`), swap to versioned
   deps and commit the regenerated lockfile. The scope rename (`@canopy/*` → `@onderling/*`)
   lands together with that swap.
2. **Remove feedback from the basis repo** — after this repo is pushed + verified. canopy-chat
   imports feedback's public barrel (`src/public`); handle that coupling first (published
   package or relocation). A real, reviewable change — not a blind delete.
3. **Codeberg mirror** — set up the pull-mirror once the org's Codeberg account exists.

Carve invariants (also honoured 2026-07-09): history scrubbed of `results-*.md` +
`portal-store.json`; `test/contact-thread-e2e.test.js` excluded (needs the canopy-chat host —
it lives on that side); interim lockfile gitignored until the publish swap.
