# Contributing — the same rules as the basis monorepo

- **Branch per feature; the trunk moves by merge.** `development` is the trunk, `master` takes releases and
  hotfixes only. Never commit on either: `git switch -c feat/<what>`, land it green, open a PR into
  `development`. The pre-commit hook refuses otherwise — run `git config core.hooksPath .githooks` once per
  clone.
- **Tests before a merge:** `npm test` (no model needed). A change to a prompt, a floor lexicon or the model
  default is measured by the golden sets (see the verification plan in the monorepo's `plans/`), not by a
  hand walk; a walk is for feel and feeds the golden sets.
- **Platform packages** are `file:` links into a sibling `canopy-mono` checkout until they are published.
