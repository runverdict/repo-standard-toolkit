# Authoring Conventions — repo-standard-toolkit

Binding rules for every file in this repo. They exist so the plugin stays honest about what it
enforces, generic across target repos, and upgradeable without breaking the repos it governed.
Numbered so reviews and commits can cite §N; sections are contiguous from §1 (the lint reddens
the build on a gap).

## 1. What this plugin is (and is not)

The plugin scaffolds repo front matter from published standards and installs a committed,
dependency-free lint plus the CI workflow that runs it. It is a **scaffolder, not an enforcer**:
after a run, the target repo polices itself with `node` alone. It is NOT a code linter, a test
framework, or a security tool, and it never certifies a repo "immaculate" — it makes drift fail
CI, which is a different and honest claim.

## 2. Enforcement lives with the code; generation lives in the agent

The load-bearing principle, never to be regressed: **enforcement must not depend on the agent.**
Anything that gates a target repo ships as committed files that run with Node built-ins in CI —
no npm install, no network, no plugin, no Claude. The agent half (skills, harness engines) does
the judgment-heavy, one-time-ish work: sensing, filling, reconciling, explaining. If a proposed
check needs the agent at enforcement time, it is rejected or redesigned.

## 3. Payload rules

- **`payload/` is the product.** Everything installed into target repos lives there:
  `payload/acceptance/test-repo-standard.mjs` (the generic lint, canonical copy),
  `payload/repo-standard.json` (the default scope config), `payload/workflows/repo-standard.yml`
  (the CI gate), `payload/templates/` (the fill-in artifacts).
- **Dogfood is byte-identical.** This repo's own `acceptance/test-repo-standard.mjs` is an
  installed copy of the payload lint; a standing sync test fails the build if the two differ.
  Edit the payload, then re-copy — never the other way.
- **Zero dependencies, forever.** The payload and every harness engine import only `node:`
  built-ins or relative paths. There is no `package.json` in this repo, and a standing test
  keeps it that way.
- **Templates are proven, not trusted.** A standing test fills every template with sample
  values and runs the shipped lint over the result — a template that scaffolds a
  standard-violating repo cannot merge.
- **The canon is hardcoded; config tunes scope.** The six Keep a Changelog categories,
  License-last, the voice ban — these are the standard and live in the lint. The per-repo
  `.repo-standard.json` selects which docs exist, which counts are machine-checked, and other
  scope — it can never water the canon down.

## 4. Skill structure

- Frontmatter: `name`, `description` (when to use it, in one breath), `allowed-tools`
  (narrowest workable set; engines granted as `Bash(node *harness/<engine>.mjs *)`).
- Body sections in order: title · one-paragraph promise · **When to use** (with NOT-for
  bullets) · **Prerequisites** · numbered **Steps** · **Automated vs. manual recap** · **What
  feeds the next skill**.
- Steps encode *failure modes*, not happy paths — every refusal an engine can make gets a
  sentence telling the agent what it means (an overwrite refusal means the plan is stale, not
  that `--force` is needed).
- Shared assets are referenced as `${CLAUDE_PLUGIN_ROOT}/payload/...` or
  `${CLAUDE_PLUGIN_ROOT}/harness/...`.
- Skills never write silently: every created/modified file appears in the recap.

## 5. Writing voice

Dense, specific, failure-encoded. Tables for matrices, prose for reasoning. No marketing
language, no "simply", no unexplained acronyms on first use. American spelling. The generated
templates hold target repos to the same voice, so this repo cannot exempt itself.

## 6. Versioning and releases

[Semantic versioning](https://semver.org/). Every user-facing change lands a CHANGELOG entry
under `[Unreleased]` in the matching category, in the same PR. Cutting a release renames
`[Unreleased]` to the dated version, bumps `.claude-plugin/plugin.json` in the same commit, and
opens a fresh `[Unreleased]`; pre-first-release, no dated sections exist. Commits follow
[Conventional Commits](https://www.conventionalcommits.org/). Payload lint changes are always at
least a **minor** bump: governed repos upgrade by re-running the scaffold skill, and their diff
should correspond to a version they can point to.

## 7. Project-meta docs standard (README / CHANGELOG / CONVENTIONS)

This repo's front matter is held to the same standard the plugin installs everywhere else,
enforced by its own installed copy of `acceptance/test-repo-standard.mjs` (scope in
`.repo-standard.json`). Grounded in the published specs, not invented here:

- **CHANGELOG → [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).** Under every
  version, the ONLY `###` subsections allowed are the six canonical change categories —
  **Added · Changed · Deprecated · Removed · Fixed · Security** — grouped (one heading per
  category per version). `[Unreleased]` stays at the top; concrete versions are
  reverse-chronological, valid semver, the newest in lockstep with the version manifest.
- **README → [standard-readme](https://github.com/RichardLitt/standard-readme).** Exactly one
  H1; a short **bold tagline** immediately after it (never a blockquote); **Install**,
  **Usage**, and **Contributing** sections; a **Caveats**/limitations section (a standard that
  ships its limits); the **License** section LAST.
- **CONVENTIONS.** The numbered `## N.` sections are contiguous from §1 — no gaps, no
  duplicates.
- **Counts are machine-verified, not trusted.** Every count declared in `.repo-standard.json`
  (here: "N standing tests" against `acceptance/test-*.mjs`) must equal the real repo fact
  wherever stated, and cross-doc numbers must agree — a forgotten count reddens the build.
- **Voice (§5) extends here.** No marketing superlatives and no "simply" in any meta doc.
- **Stable meta files** — SECURITY, CONTRIBUTING, CODE_OF_CONDUCT (the
  [Contributor Covenant](https://www.contributor-covenant.org/), currently 3.0) exist and open
  with an H1.
