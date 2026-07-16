# repo-standard-toolkit

**Bootstrap and enforce enterprise repo hygiene into any codebase — one command.** A Claude
Code plugin that scaffolds immaculate project scaffolding (README, CHANGELOG, CONVENTIONS,
CONTRIBUTING, CODE_OF_CONDUCT, the CI gate) from published standards, then installs a committed
linter so the standard polices itself on every push — with or without Claude.

> **Status: seed / vision.** This repo currently holds only the concept. Nothing is built yet.
> It was planted the day its pattern proved out inside
> [`ai-readiness-review-toolkit`](https://github.com/runverdict/ai-readiness-review-toolkit) —
> see [Origin](#origin) for the working reference implementation to lift from. The name is a
> placeholder; rename freely.

## Table of Contents

- [Background](#background)
- [The vision](#the-vision)
- [How it works](#how-it-works)
- [The standards it embodies](#the-standards-it-embodies)
- [Install](#install)
- [Usage](#usage)
- [Kickoff prompt](#kickoff-prompt)
- [Origin](#origin)
- [Caveats](#caveats)
- [Contributing](#contributing)
- [License](#license)

## Background

Every serious repo re-invents the same front matter — a README that drifts stale, a CHANGELOG
that decays into ad-hoc sections, counts that are hand-synced across files until someone forgets
one, a COPY-MANIFEST whose totals stop summing. The fixes are all **known, published standards**
(Keep a Changelog, standard-readme, Contributor Covenant, SemVer, Conventional Commits). What's
missing is a tool that (a) installs them correctly from the first commit and (b) makes them
**self-enforcing** so they can never rot.

The load-bearing principle, learned the hard way:

> **Enforcement lives with the code it gates. Generation lives in the agent. Never make
> enforcement depend on the agent.**

A linter that only fires inside one editor or one AI tool is not a gate — a contributor on a fork
with vim drifts it freely and CI stays green. So the enforcement is a **committed lint run in
CI**, tool-agnostic. The agent's job is the *other* half: authoring and installing that
enforcement, which is judgment-heavy, cross-repo, and one-time-ish — exactly what a plugin is
good at.

## The vision

`repo-standard-toolkit` is the **scaffolder**, not the enforcer. Invoked on any repo, it:

1. **Senses state.** Greenfield (nothing exists yet) vs. mid-project (files exist and must be
   brought into compliance without clobbering real content) — by detecting which of the standard
   artifacts + the lint + the CI workflow are already present.
2. **Scaffolds what's missing** from immaculate, standards-grounded templates: a standard-readme
   skeleton, an empty Keep a Changelog, a numbered CONVENTIONS, a Contributor Covenant
   CODE_OF_CONDUCT, a CONTRIBUTING, a SECURITY policy, a LICENSE, and a `.github/workflows` gate.
3. **Brings existing files into compliance** — reconciles a drifted CHANGELOG into canonical
   categories, adds a missing Contributing section, fixes stale counts — surfacing every change
   for review, never silently rewriting prose.
4. **Installs its own enforcement** — the key move: it drops in a **committed linter + the CI
   workflow that runs it**, so from push #1 the standard is self-policing and the plugin is no
   longer in the loop.
5. **Is idempotent.** Safe to re-run on any repo at any maturity; it reconciles, never duplicates
   or clobbers.

The result: a one-command way to make *every* repo you build start — and stay — immaculate, to
the same standard, without the plugin being a runtime dependency of any of them.

## How it works

Two layers, cleanly separated:

| Layer | Artifact | Runs | Depends on Claude? |
|---|---|---|---|
| **Scaffold / author** | this plugin (a Claude Code skill) | on demand, once per repo | yes — it's the agent |
| **Enforce** | a committed lint + `.github/workflows/*.yml` | every push / PR, in CI | **no** — tool-agnostic |

The plugin *generates* what CI *enforces*, then steps out. The enforcement it installs is a
dependency-free standing test (Node built-ins only, no `npm install`) that fails the build on
drift: canonical CHANGELOG categories, README structure with License last, contiguous CONVENTIONS
numbering, any manifest totals reconciled against their own rows, a marketing-voice ban, and
machine-checked counts that must match the real repo.

A generic core (the standards below, which apply to any repo) plus a thin per-repo extension (the
counts and artifacts unique to that project). The plugin installs the generic core; each repo
declares its own specifics.

## The standards it embodies

Grounded in the published specs, not invented here:

- **CHANGELOG** → [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) — the six
  canonical categories (Added / Changed / Deprecated / Removed / Fixed / Security), an
  `[Unreleased]` section, reverse-chronological versions.
- **README** → [standard-readme](https://github.com/RichardLitt/standard-readme) — one H1, a short
  bold tagline, Install + Usage + Contributing, License last.
- **CODE_OF_CONDUCT** → [Contributor Covenant](https://www.contributor-covenant.org/).
- **Versioning** → [SemVer](https://semver.org/), with the CHANGELOG version locked to the
  package/plugin manifest.
- **Commits** → [Conventional Commits](https://www.conventionalcommits.org/).
- **Enforcement pattern** → a committed CI linter, the same way ESLint / markdownlint / commitlint
  live in the repo, never hidden in an editor plugin.

## Install

Not built yet. When it is, the intended shape:

```bash
claude plugin marketplace add runverdict/repo-standard-toolkit
claude plugin install repo-standard-toolkit@runverdict-plugins
```

## Usage

Not built yet. The intended UX — one command from any repo root:

```
/repo-standard-toolkit:scaffold
```

It senses whether the repo is greenfield or mid-project, scaffolds or reconciles accordingly,
installs the committed lint + CI gate, and hands back a review of everything it created or changed.

## Kickoff prompt

Paste this into a fresh Claude Code session in this repo when you're ready to build it:

> Build `repo-standard-toolkit`: a Claude Code plugin that bootstraps and enforces enterprise repo
> hygiene into any codebase. The **reference implementation to lift from** is the project-meta
> governance already shipped in `runverdict/ai-readiness-review-toolkit` — read its
> `acceptance/test-project-meta-hygiene.mjs` (the enforcement lint), `CONVENTIONS.md` §11 (the
> written standard), `.github/workflows/test.yml` (the CI gate), and `docs/README.md` (the docs
> governance system + templates). Generalize that repo-specific lint into a **configurable generic
> core** (Keep a Changelog categories, standard-readme structure + License-last, contiguous
> CONVENTIONS numbering, manifest-totals reconcile, marketing-voice ban, machine-checked counts)
> plus a thin per-repo extension for project-specific counts. Then build the **scaffolder skill**:
> sense greenfield vs. mid-project; scaffold missing artifacts from standards-grounded templates
> (README/CHANGELOG/CONVENTIONS/CONTRIBUTING/CODE_OF_CONDUCT[Contributor Covenant]/SECURITY/LICENSE
> + the CI workflow); reconcile existing drifted files without clobbering prose; **install the
> committed lint + CI so the standard self-polices from push #1**; idempotent, review-surfacing,
> never silent. Hold to the same bar as the parent toolkit: zero runtime npm deps (Node built-ins),
> every determinizable property locked by a standing `acceptance/test-*.mjs`, adversarially verify
> the generated output, identity-clean conventional commits. Core principle to preserve throughout:
> **enforcement lives with the code it gates (CI), generation lives in the agent (this plugin);
> never make enforcement depend on the agent.**

## Origin

Born from [`ai-readiness-review-toolkit`](https://github.com/runverdict/ai-readiness-review-toolkit),
where the project-meta governance system was first built and proven: a committed lint
(`test-project-meta-hygiene.mjs`) that fails CI on any drift in README / CHANGELOG / CONVENTIONS /
COPY-MANIFEST, documented as CONVENTIONS §11, grounded in Keep a Changelog + standard-readme. This
repo is the seed of extracting that pattern into a reusable plugin so every toolkit starts
immaculate and stays that way.

## Caveats

A seed, not a product — nothing here runs yet. The scope is repo **hygiene / front matter**
(docs, changelog, meta files, the CI gate), not code linting or security review (that is the
parent toolkit's job). When built, the enforcement it installs must stay tool-agnostic and
dependency-free, or it fails its own thesis.

## Contributing

Not open yet — this is a private seed. When it becomes a real project it will ship a
`CONTRIBUTING.md` and a `CODE_OF_CONDUCT.md` (Contributor Covenant), and — of course — it will
scaffold and enforce its own standard on itself.

## License

To be decided when the project is built (likely Apache-2.0, matching the parent toolkit).
