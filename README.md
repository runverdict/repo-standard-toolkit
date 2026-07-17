# repo-standard-toolkit

[![CI](https://github.com/runverdict/repo-standard-toolkit/actions/workflows/test.yml/badge.svg)](https://github.com/runverdict/repo-standard-toolkit/actions/workflows/test.yml) [![Release](https://img.shields.io/github/v/release/runverdict/repo-standard-toolkit)](https://github.com/runverdict/repo-standard-toolkit/releases) [![License](https://img.shields.io/github/license/runverdict/repo-standard-toolkit)](LICENSE) [![Dependencies: none](https://img.shields.io/badge/dependencies-none-success)](acceptance/test-supply-chain.mjs)

**Bootstrap and enforce enterprise repo hygiene into any codebase — one command.** A Claude
Code plugin that scaffolds project front matter (README, CHANGELOG, CONVENTIONS, CONTRIBUTING,
CODE_OF_CONDUCT, SECURITY, LICENSE, the CI gate) from published standards, then installs a
committed linter so the standard polices itself on every push — with or without Claude.

> **Status: released.** Versions and history live in the [CHANGELOG](CHANGELOG.md); the first
> tag (0.2.0) was cut after validated fixture runs and a live-repo drill — gate green on push,
> and an active ruleset shown blocking a red PR, an admin merge, and a spoofed status.
> Everything below is test-guarded in this tree — 11 standing tests, 14 lint checks, zero npm
> dependencies — and the repo governs itself with the exact lint it installs elsewhere.

## Table of Contents

- [Background](#background)
- [How it works](#how-it-works)
- [Install](#install)
- [Usage](#usage)
- [What gets installed](#what-gets-installed)
- [The standards it embodies](#the-standards-it-embodies)
- [Documentation](#documentation)
- [Caveats](#caveats)
- [Contributing](#contributing)
- [License](#license)

## Background

Every serious repo re-invents the same front matter — a README that drifts stale, a CHANGELOG
that decays into ad-hoc sections, counts that are hand-synced across files until someone forgets
one, a manifest whose totals stop summing. The fixes are all **known, published standards**
(Keep a Changelog, standard-readme, Contributor Covenant, SemVer, Conventional Commits). What
was missing is a tool that (a) installs them correctly from the first commit and (b) makes them
**self-enforcing** so they can never rot.

The load-bearing principle, learned the hard way:

> **Enforcement lives with the code it gates. Generation lives in the agent. Never make
> enforcement depend on the agent.**

A linter that only fires inside one editor or one AI tool is not a gate — a contributor on a
fork with vim drifts it freely and CI stays green. So the enforcement is a **committed lint run
in CI**, tool-agnostic, dependency-free. The agent's job is the *other* half: authoring and
installing that enforcement. The full reasoning lives in [Design](docs/design.md).

## How it works

Two layers, cleanly separated:

| Layer | Artifact | Runs | Depends on Claude? |
|---|---|---|---|
| **Scaffold / author** | the `scaffold` skill + `harness/` engines | on demand, per repo | yes — it's the agent |
| **Enforce** | `acceptance/test-repo-standard.mjs` + `.repo-standard.json` + `.github/workflows/*.yml`, committed into the target | every push / PR, in CI | **no** — `node` alone |

The skill senses the repo (`greenfield` / `partial` / `governed` — detected, never assumed),
confirms a plan, scaffolds what is missing from templates, reconciles what drifted with minimal
quoted edits, installs the lint + config + CI gate verbatim, and iterates the suite to green.
Then it steps out: the standard is now policed by the committed lint, and re-invoking the skill
later is the reconcile/upgrade path, safe at any maturity.

## Install

```bash
claude plugin marketplace add runverdict/plugins
claude plugin install repo-standard-toolkit@runverdict-plugins
```

Requirements: the target repo needs nothing beyond **Node 18+ in CI** for the installed gate.
There is nothing to `npm install` — the lint, the engines, and the standing tests use Node
built-ins only.

## Usage

From any repo root, one command at any maturity:

```
/repo-standard-toolkit:scaffold
```

- **Greenfield:** scaffolds the full front matter + enforcement, asks only for what it cannot
  derive, and refuses to invent what it cannot verify — honest thin sections beat padded false
  ones.
- **Mid-project:** reconciles drifted files with the smallest possible edits, quoting every
  change (before → after) in the recap. Prose is preserved; an ad-hoc CHANGELOG section is
  re-homed, never deleted.
- **Re-run / upgrade:** sensing is the idempotency mechanism. Every lint carries its payload
  version, so a re-run distinguishes upgrade from downgrade from local edit — a stale plugin
  is stopped rather than allowed to downgrade a newer committed lint.

**It does not run on its own.** The plugin is invoked by you, once per repo, plus re-runs for
reconcile or upgrade. What runs automatically afterward is the CI gate — committed files in
your repo, triggered by GitHub, with the plugin nowhere in the loop:

```bash
for t in acceptance/test-*.mjs; do node "$t" || exit 1; done
```

## What gets installed

All committed, all dependency-free — the full detail is in
[Enforcement](docs/enforcement.md):

- `acceptance/test-repo-standard.mjs` — the standing README + changelog linter: 14 checks
  covering Keep a Changelog shape, version lockstep, standard-readme structure, machine-checked
  counts, the marketing-voice ban, license agreement, and more. Exit 1 = fix the docs, exit 2 =
  fix the config; every skip is a printed, named line.
- `.repo-standard.json` — the repo's declared scope. See [Configuration](docs/configuration.md).
- `.github/workflows/test.yml` — the CI gate, with a read-only token.
- The meta docs themselves, where missing, filled from templates and grounded in the real repo.
- Optionally, on your yes: a local `pre-push` hook (a convenience, not a gate) and a GitHub
  branch ruleset that makes the check **required** — the piece that turns a red run into a
  blocked merge. Until a repo requires the check, a red run blocks nothing; the skill says so
  rather than implying otherwise.

## The standards it embodies

Grounded in the published specs, not invented here:

- **CHANGELOG** → [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
- **README** → [standard-readme](https://github.com/RichardLitt/standard-readme)
- **CODE_OF_CONDUCT** → [Contributor Covenant](https://www.contributor-covenant.org/) 3.0
- **Versioning** → [SemVer](https://semver.org/) · **Commits** →
  [Conventional Commits](https://www.conventionalcommits.org/)
- **Enforcement pattern** → a committed CI linter, the way ESLint / markdownlint / commitlint
  live in a repo, never hidden in an editor plugin.

The canon is **hardcoded in the lint** — config tunes scope, never the standard itself.

## Documentation

- [Enforcement](docs/enforcement.md) — the 14 checks, the CI gate, the required-check ruleset,
  and the optional pre-push hook.
- [Configuration](docs/configuration.md) — the `.repo-standard.json` surface: counts, scoped
  docs, the loud off switch, recorded provenance.
- [Design](docs/design.md) — the load-bearing principle, the origin story, and the deliberate
  rejections.
- [CONVENTIONS.md](CONVENTIONS.md) — the binding rules this repo itself is held to.
- [acceptance/README.md](acceptance/README.md) — the standing-test suite.
- [CHANGELOG.md](CHANGELOG.md) — full version history.

## Caveats

- **Scope is repo hygiene / front matter** — docs, changelog, meta files, the CI gate. Not code
  linting, not tests, not security review.
- **Markdown + GFM assumptions.** The lint reads ATX headings (`#`), fenced code blocks, and
  pipe tables; exotic markdown layouts may need the config's paths or a reasoned check disable.
- **Single-root repos.** Monorepo per-package scoping is not built; govern the repo root, or
  run per package with separate configs at your own judgment.
- **The count glob is deliberately tiny** — literal directories + `*` in the basename. Deeper
  truths use `file` + `lineRegex`. That smallness is what keeps the enforcement auditable.
- **A scaffold is not a certification.** The gate proves structure, consistency, and
  machine-checkable facts; the prose quality of what an agent writes still needs the operator's
  review — which is why every run ends in a quoted recap and nothing is committed for you.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow and
[`CONVENTIONS.md`](CONVENTIONS.md) for the binding rules — the enforcement/generation split,
the payload byte-identity discipline, and the rule that every determinizable property lands in
a standing test (11 standing tests today; the pass is zero failures, never a fixed count). By
participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Apache-2.0 © runverdict. See [`LICENSE`](LICENSE).
