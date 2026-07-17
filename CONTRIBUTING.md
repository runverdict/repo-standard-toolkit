# Contributing

Thanks for considering a contribution. This plugin's whole thesis is that repo hygiene should be
**standards-grounded, self-enforcing, and agent-independent** — a contribution that is useful but
breaks one of those properties will be asked to change. The full house rules live in
[`CONVENTIONS.md`](CONVENTIONS.md); the essentials are below.

## Prerequisites

- **Node.js 18+** (the harness engines, the payload lint, and the standing tests use only Node
  built-ins — no `npm install`, no dependencies, no network).
- Git, and the `gh` CLI if you want to use GitHub's flows.

## The one command that gates everything

Every determinizable property is locked by a dependency-free standing test. Run the whole suite
before you push, and keep it green:

```bash
for t in acceptance/test-*.mjs; do node "$t" || exit 1; done
```

A green suite is the bar for a merge. The pass is **zero failures**, never a fixed count.

## What a good change looks like

- **Edit the payload, not the installed copy.** The canonical generic lint lives at
  `payload/acceptance/test-repo-standard.mjs`; this repo's own
  `acceptance/test-repo-standard.mjs` is a byte-identical installed copy (we dogfood what we
  ship), and a standing sync test reddens the build if the two ever differ. Change the payload,
  then re-copy.
- **Templates must stay lint-green.** Every `payload/templates/*` fill is proven against the
  shipped lint by a standing test — a template edit that a freshly scaffolded repo would fail on
  reddens the build.
- **Enforcement never depends on the agent.** Anything the payload installs into a target repo
  must run with `node` alone — no npm packages, no plugin, no Claude. If your check needs the
  agent, it belongs in the skill, not the payload.
- **Encode behavior in a test, not in prose.** A determinizable claim (a count, a structure
  rule, a refusal path) belongs in an engine or the lint, guarded by a self-asserting
  `acceptance/test-*.mjs`. A rule that exists only as skill prose is only as strong as the model
  that remembers to invoke it.
- **Voice (`CONVENTIONS.md` §5).** Dense, specific, honest. No marketing language, no "simply",
  no unexplained acronyms on first use. American spelling.

## Pull requests

- Branch off `main`; PRs target `main`.
- **Conventional commits** (`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`).
- Keep the changeset complete: a change updates any affected docs — README, a CHANGELOG entry
  under `[Unreleased]`, CONVENTIONS — in the **same** PR.
- Describe what you changed and why, and confirm the suite is green.

By contributing you agree your work is licensed under the repository's
[Apache-2.0](LICENSE) license, and you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).
