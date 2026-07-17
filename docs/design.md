# Design

The decisions that shape this toolkit, including the ones that look like missing features and
are not. Recorded so a future contributor (or a future maintainer having a clever idea at
midnight) can see what was already considered and why it lost.

## The load-bearing principle

> **Enforcement lives with the code it gates. Generation lives in the agent. Never make
> enforcement depend on the agent.**

A linter that only fires inside one editor or one AI tool is not a gate — a contributor on a
fork with vim drifts it freely and CI stays green. So the enforcement is a committed lint run
in CI, tool-agnostic, dependency-free. The agent's job is the other half: authoring and
installing that enforcement, which is judgment-heavy, cross-repo, and one-time-ish — exactly
what a plugin is good at. If a proposed check needs the agent at enforcement time, it gets
rejected or redesigned.

## Origin

Born from `ai-readiness-review-toolkit` — a private Verdict toolkit, which is why this section
carries no link — where the project-meta governance system was first built and proven: a
committed lint that fails CI on any drift in README / CHANGELOG / CONVENTIONS / manifest docs,
grounded in Keep a Changelog + standard-readme. This plugin is that pattern, generalized.
During development the generic core was run against the parent's real meta docs and reproduced
the proven lint's verdict on the same tree — including catching the same live count drift the
parent's own gate catches. (A development-time result, not a standing test; what stands in
this tree is the mutation coverage in `acceptance/test-lint-behavior.mjs`.)

## Deliberate rejections

Each of these was considered and refused on purpose. The refusal is part of the design.

- **Expiry dates on check disables.** A disable that auto-reactivates on a calendar date makes
  the lint's verdict depend on when you run it — the same tree must always lint the same.
  Freshness is never age-gated anywhere in the toolkit; the loud printed reason is the
  pressure mechanism instead.
- **Node 22's `fs.globSync`.** A hand-rolled ~12-line basename-only matcher keeps the floor at
  Node 18+ and keeps the matching auditable at a glance. Deeper truths use `file` +
  `lineRegex` instead of a richer glob.
- **A custom-check registry in the config.** Extra `acceptance/test-*.mjs` files already serve
  exactly that purpose — the gate loop runs every one it finds, so a repo extends the standard
  by writing a test, not by configuring one.
- **Monorepo / per-package scoping.** Deliberately out of scope for now: govern the repo root,
  or run per package with separate configs at your own judgment.
- **A committed hook via `core.hooksPath`.** The pre-push check stays per-clone, uncommitted,
  and skippable, because committing it would imply it is part of the standard — and a
  client-side hook can never be enforcement. The CI check (made required via ruleset) is.
- **A push-time prompt to adopt the standard.** Adoption is a reviewed change deserving its own
  session and PR, not an interruption of unrelated work — and a prompt dismissed on every push
  trains you to ignore it.
- **`evaluate` as the shipped ruleset enforcement.** GitHub gates that dry-run mode to
  Enterprise plans; shipping it would fail the documented apply on most repos. The payload
  ships `disabled` — inert everywhere, activation is the operator's deliberate act.
- **Auto-injected attribution badges in scaffolded repos.** The scaffolded CONVENTIONS carries
  one factual sentence naming what installed the lint; that is the ceiling. Decorative badges
  are the operator's to add, never the tool's.
- **A marketplace of its own.** A marketplace name is a global, once-per-user key, so a
  namespace needs exactly one authority. The catalog lives in
  [runverdict/plugins](https://github.com/runverdict/plugins); this repo ships a plugin
  manifest and stays out of the namespace business.
- **A version field in the catalog entry.** The plugin's own manifest owns the version; a copy
  in the catalog could only ever drift into a lie.

## What the gate does and does not prove

The gate proves structure, consistency, and machine-checkable facts. It does not prove prose
quality, and the toolkit never claims a scaffold is a certification — every run ends in a
quoted recap precisely because the operator's review is part of the design, not an optional
extra.
