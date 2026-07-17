# repo-standard-toolkit

**Bootstrap and enforce enterprise repo hygiene into any codebase — one command.** A Claude
Code plugin that scaffolds immaculate project front matter (README, CHANGELOG, CONVENTIONS,
CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, LICENSE, the CI gate) from published standards, then
installs a committed linter so the standard polices itself on every push — with or without
Claude.

> **Status: built, pre-first-release.** The plugin version is `0.1.0`; the first tag is cut
> after field runs against real repos. Everything below describes what exists and is
> test-guarded in this tree — 11 standing tests, zero npm dependencies, and the repo governs
> itself with the exact lint it installs elsewhere.

## Table of Contents

- [Background](#background)
- [How it works](#how-it-works)
- [What gets installed](#what-gets-installed)
- [The standards it embodies](#the-standards-it-embodies)
- [Install](#install)
- [Usage](#usage)
- [The optional pre-push check](#the-optional-pre-push-check)
- [The config](#the-config)
- [Origin](#origin)
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
installing that enforcement, which is judgment-heavy, cross-repo, and one-time-ish — exactly
what a plugin is good at.

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
later is the reconcile/upgrade path, safe at any maturity — it senses, never duplicates, never
force-overwrites.

## What gets installed

Into the target repo, all committed, all dependency-free:

- `acceptance/test-repo-standard.mjs` — the standing lint. Checks: Keep a Changelog categories
  + shape + semver ordering, CHANGELOG ⟺ version-manifest lockstep, standard-readme structure
  with License last, contiguous numbered CONVENTIONS sections, manifest Totals reconciliation,
  a marketing-voice ban, machine-checked counts against the real tree, lint ⟺ spec
  reflexivity, stable meta files, no surviving scaffold TODOs or unfilled `{{PLACEHOLDER}}`
  tokens, license agreement (a root license file exists, and a recognizable license text must
  match every declared manifest license field and the README's License section — what cannot
  be compared is a named skip), and no governed doc
  duplicated across the GitHub-served locations (`.github/` > root > `docs/`). Exit 1 means the
  docs drifted; exit 2 means the config is broken; every skip is a printed, named line.
- `.repo-standard.json` — the repo's declared scope (see [The config](#the-config)).
- `.github/workflows/test.yml` — the gate: a read-only token running every
  `acceptance/test-*.mjs` on push and PR. (Named `repo-standard.yml` instead when the repo
  already has workflows; installed as the lint-only scoped variant when pre-existing acceptance
  tests are red, so the gate is never born red on someone else's tests.)
- The meta docs themselves, where missing — README, CHANGELOG, CONVENTIONS, CONTRIBUTING,
  CODE_OF_CONDUCT, SECURITY, LICENSE — filled from `payload/templates/`, with every
  `TODO(scaffold)` marker resolved against the real repo before the gate lets them pass.

Optionally, if you say yes when asked: a `pre-push` hook in `.git/hooks/` that runs the lint
locally before each push. See [The optional pre-push check](#the-optional-pre-push-check).

## The standards it embodies

Grounded in the published specs, not invented here:

- **CHANGELOG** → [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) — the six
  canonical categories (Added / Changed / Deprecated / Removed / Fixed / Security), an
  `[Unreleased]` section, reverse-chronological semver versions locked to the version manifest.
- **README** → [standard-readme](https://github.com/RichardLitt/standard-readme) — one H1, a
  short bold tagline, Install + Usage + Contributing, License last.
- **CODE_OF_CONDUCT** → [Contributor Covenant](https://www.contributor-covenant.org/) 3.0.
- **Versioning** → [SemVer](https://semver.org/). **Commits** →
  [Conventional Commits](https://www.conventionalcommits.org/).
- **Enforcement pattern** → a committed CI linter, the same way ESLint / markdownlint /
  commitlint live in a repo, never hidden in an editor plugin.

The canon is **hardcoded in the lint** — config tunes scope (which docs, which counts, extra
sections, extra banned words), never the standard itself.

## Install

```bash
claude plugin marketplace add runverdict/claude-plugins
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
  derive (license choice, contact addresses, a tagline), and refuses to invent what it cannot
  verify — honest thin sections beat padded false ones.
- **Mid-project:** reconciles drifted files into compliance with the smallest possible edits,
  quoting every change (before → after) in the recap. Prose is preserved; an ad-hoc CHANGELOG
  section is re-homed, never deleted. If pre-existing acceptance tests are red, the gate is
  scoped so it is never born red on someone else's tests.
- **Re-run / upgrade:** sensing is the idempotency mechanism — a governed repo reconciles, and
  a newer payload lint replaces the installed copy wholesale (repo specifics live in the
  config, so upgrades never clobber them). The replacement is version-directed: every lint
  carries its payload version, so a re-run distinguishes upgrade from downgrade from local
  edit — and a stale plugin is stopped rather than allowed to downgrade a newer committed
  lint while calling it an upgrade.

Every run ends with an automated-vs-manual recap: every file created or changed with why, and
what only the operator can finish. The gate this repo runs on itself is the same loop the
installed workflow runs everywhere:

```bash
for t in acceptance/test-*.mjs; do node "$t" || exit 1; done
```

**It does not run on its own.** The plugin is invoked by you, once per repo, plus re-runs for
reconcile or upgrade. Nothing watches your repos, and installing the plugin changes nothing
about repos you never point it at. What runs automatically afterward is the CI gate — committed
files in your repo, triggered by GitHub, with the plugin nowhere in the loop.

## The optional pre-push check

Once a repo is governed and green, the skill offers one convenience — and only if you say yes:

```
node ${CLAUDE_PLUGIN_ROOT}/harness/install-hook.mjs --target .
```

It installs `.git/hooks/pre-push`, which runs the repo-standard lint (and nothing else — your
own test suite is your business) before each push, so drift fails in your terminal in a moment
rather than in CI a minute later.

**It is a convenience, not a gate**, and the design says so out loud: it is per-clone,
uncommitted, skipped by `git push --no-verify`, and absent for anyone who clones fresh. That is
exactly why it is installed *uncommitted* — committing it would imply it is part of the
standard, and a hook can never be. The gate is the same lint, run by CI, which no one can skip.

The engine refuses rather than surprising you: it never clobbers a pre-push hook it did not
write, it reports instead of writing into `.git/hooks` when `core.hooksPath` points elsewhere
(husky and friends), and it turns away an ungoverned repo. Remove it any time with
`--uninstall`, or just `rm .git/hooks/pre-push`.

There is deliberately **no push-time prompt asking whether to adopt the standard.** Adoption is
a reviewed change to a repo's front matter; it deserves its own session and its own PR, not an
interruption while you are shipping something else — and a prompt you dismiss on every push is
just noise you have trained yourself to ignore.

## The config

`.repo-standard.json`, operator-owned, reconciled (never regenerated) on re-runs. A missing
file still runs the full hardcoded canon, with default scope (no counts, no extra sections);
the scaffolder ships a stricter starting config. Keys starting with `//` are comments. Unknown
keys are hard errors — nothing is silently ignored. The interesting surface:

```json
{
  "version": 1,
  "manifest": { "file": "COPY-MANIFEST.md", "statuses": ["UNCHANGED", "MODIFIED", "NEW"] },
  "readme": { "requireSections": ["usage", "caveat|limitation"] },
  "conventions": { "minSections": 7 },
  "voice": { "extraBanned": ["frictionless"], "properNouns": ["Seamless Deploy"] },
  "counts": {
    "standing-tests": {
      "pattern": "(\\d[\\d,]*)\\s+standing tests",
      "glob": "acceptance/test-*.mjs",
      "minMentions": 2
    }
  },
  "checks": { "lockstep": { "enabled": false, "why": "printed loudly on every run" } }
}
```

Counts are the anti-drift core: a numeric claim in prose is bound to a derivable fact (a file
glob, a line-regex count) and to every other doc stating it — a forgotten update reddens the
build instead of shipping a lie. `under` scopes a count to a region (e.g. `[Unreleased]`) so
historical numbers in dated CHANGELOG blocks stay historical.

## Origin

Born from
[`ai-readiness-review-toolkit`](https://github.com/runverdict/ai-readiness-review-toolkit),
where the project-meta governance system was first built and proven: a committed lint
(`test-project-meta-hygiene.mjs`) that fails CI on any drift in README / CHANGELOG /
CONVENTIONS / COPY-MANIFEST, documented as its CONVENTIONS §11, grounded in Keep a Changelog +
standard-readme. This plugin is that pattern, generalized. During development the generic core
was run against the parent's real meta docs and reproduced the proven lint's verdict on the same
tree — including catching the same live count drift the parent's own gate catches. (That run is
a development-time result, not a standing test in this tree; what IS standing here is the
mutation coverage in `acceptance/test-lint-behavior.mjs`.)

## Caveats

- **Scope is repo hygiene / front matter** — docs, changelog, meta files, the CI gate. Not code
  linting, not tests, not security review (that is the parent toolkit's job).
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
