# Acceptance tests

The standing, dependency-free proof that this plugin does what it claims — run with Node
built-ins only, no `npm install`, no network, no LLM:

```bash
for t in acceptance/test-*.mjs; do node "$t" || exit 1; done
```

The pass is **zero failures**, never a fixed count (the check count grows with every change; a
hardcoded total would be false the moment a test lands). CI runs exactly this loop on every push.

What the suite locks, by family:

- **The payload lint's behavior** — every rule in `payload/acceptance/test-repo-standard.mjs`
  is proven twice: it PASSES a known-clean fixture repo, and it FAILS the fixture with that one
  rule's violation planted (mutation coverage — a check that cannot redden is not a gate).
  Config handling gets the same treatment: defaults on a missing config, hard errors on unknown
  keys, loud SKIP lines on disabled checks.
- **Payload ⟺ dogfood sync** — this repo's own `acceptance/test-repo-standard.mjs` is
  byte-identical to the payload copy, so what we ship is exactly what we live under.
- **Templates are lint-green** — every `payload/templates/*` file, filled with sample values
  the way the scaffold skill would fill it, produces a repo the shipped lint passes.
- **Engine behavior** — `harness/fill-template.mjs` (total fill, typo refusal, no-clobber) and
  `harness/sense-state.mjs` (classification, plan, payload-match detection) against fixture
  trees.
- **Skill and plugin wiring** — SKILL.md frontmatter and anatomy, engine references that exist
  and are granted, plugin/marketplace manifest consistency, CHANGELOG ⟺ plugin.json version
  lockstep.
- **This repo's own hygiene** — the installed `test-repo-standard.mjs` copy governs this repo's
  front matter under `.repo-standard.json`, and supply-chain posture (no `package.json`,
  stdlib-only imports, read-only CI token) has its own guard.
