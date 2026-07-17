# Changelog

All notable changes to **repo-standard-toolkit** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semantic versioning](https://semver.org/).

Maintenance rule: every user-facing change lands an entry under `[Unreleased]` in the matching
category. Cutting a tag renames `[Unreleased]` to the version + date, bumps
`.claude-plugin/plugin.json` in the same commit, and opens a fresh `[Unreleased]`.
**Pre-first-release there are no dated version sections** — per Keep a Changelog, version
headings correspond to real tagged releases, so all pre-release work stays here until the first
tag is cut.

## [Unreleased]

### Added

**The generic enforcement core** (`payload/acceptance/test-repo-standard.mjs`)
- The proven project-meta lint from
  [`ai-readiness-review-toolkit`](https://github.com/runverdict/ai-readiness-review-toolkit)
  (PM1–PM8), generalized into a configurable, dependency-free standing test any repo commits and
  runs in CI with `node` alone: Keep a Changelog categories + shape + semver ordering
  (RS-changelog), CHANGELOG ⟺ version-manifest lockstep (RS-lockstep), standard-readme
  structure with License last (RS-readme), contiguous numbered CONVENTIONS sections
  (RS-conventions), manifest Totals reconciliation (RS-manifest), the marketing-voice ban
  (RS-voice), declarative machine-checked counts (RS-counts), lint ⟺ spec reflexivity
  (RS-reflexivity), stable meta files (RS-stable-docs), and no surviving `TODO(scaffold)`
  markers (RS-todos).
- `.repo-standard.json` — the per-repo scope config. The canon is hardcoded in the lint; config
  tunes scope only: doc paths (README pinned to GitHub-rendered locations), an optional
  reconciled manifest, extra required README sections, extra banned words (each must be
  documented in CONVENTIONS — enforced), `properNouns` voice exemptions (printed on every run),
  and counts as `pattern` + source of truth (`glob`, `file`+`lineRegex`, or agreement-only) with
  `minMentions` and `under` region scoping so historical numbers in dated CHANGELOG blocks stay
  historical. Unknown keys, bare-false disables, and unsupported versions are hard errors:
  exit 2 (fix the config) is a distinct failure class from exit 1 (fix the docs). A disabled
  check requires a stated reason and prints it on every run; every skip is a named line.
- `payload/workflows/repo-standard.yml` — the CI gate (read-only token, runs every
  `acceptance/test-*.mjs`).

**The scaffolder** (the agent half — never in the enforcement loop)
- `skills/scaffold` — senses greenfield vs. mid-project vs. governed, confirms the plan,
  scaffolds missing artifacts from the templates, reconciles drifted ones with minimal quoted
  edits (never clobbering prose), installs the lint + config + CI gate verbatim, and verifies to
  green. Idempotent: re-running senses the tree and reconciles; it never duplicates and never
  force-overwrites.
- `harness/sense-state.mjs` — the read-only inventory + deterministic classification and
  per-artifact action plan (scaffold / audit / install / upgrade / keep), with placeholder
  derivation from git and manifests.
- `harness/fill-template.mjs` — deterministic placeholder fill: refuses an unfilled
  placeholder, an unused key, and an un-forced overwrite, so a scaffold can never be silently
  partial.
- `harness/install-hook.mjs` + `payload/hooks/pre-push` — an **optional** local pre-push check,
  offered (never assumed) once a repo is governed and green. It runs the repo-standard lint and
  nothing else — not the repo's own test suite — so drift fails in the terminal instead of in CI
  a minute later. It is a **convenience, not a gate**, and is installed uncommitted into
  `.git/hooks/` precisely because a per-clone, `--no-verify`-skippable hook that a fresh clone
  never gets can never be enforcement; committing it would imply otherwise. The engine refuses
  rather than surprising anyone: a foreign pre-push hook is never clobbered, a `core.hooksPath`
  pointing elsewhere is reported instead of writing where git will never look, and an ungoverned
  repo is turned away. There is deliberately **no** push-time prompt to adopt the standard:
  adoption is a reviewed change that deserves its own session, not an interruption of unrelated
  work.
- `payload/templates/` — standards-grounded fill-in artifacts: standard-readme README, Keep a
  Changelog CHANGELOG, numbered CONVENTIONS (with the meta-docs-standard section the
  reflexivity check requires), CONTRIBUTING, Contributor Covenant 3.0 CODE_OF_CONDUCT,
  SECURITY, and Apache-2.0 / MIT license texts.

**The proof that it holds** (10 standing tests, zero npm dependencies)
- Mutation coverage of every lint rule: a known-clean fixture passes, then one targeted
  violation per rule must redden with the right check named — including the exemptions
  (quoted/fenced/properNouns) staying green and the exit-class split staying 2 vs 1.
- The scaffold → gate loop, mechanically: every template filled through the real engine,
  `TODO(scaffold)` resolution proven load-bearing, the result green under the shipped default
  config.
- Payload ⟺ dogfood byte-identity (this repo runs the exact lint + workflow it ships), engine
  behavior suites for `sense-state` and `fill-template`, skill wiring (engines exist and are
  granted; payload references exist), CHANGELOG ⟺ plugin.json lockstep, and supply-chain
  posture (no `package.json` anywhere, stdlib-only imports, least-privilege CI tokens — for
  this repo and for what gets installed into targets).
- Validated during development against the parent toolkit's real meta docs: the generic lint
  reproduced the proven repo-specific lint's verdict on the same tree, including catching the
  same live count drift (a development-time run; the standing in-tree proof is the mutation
  coverage above).

**This repo governs itself** — `.repo-standard.json` + the installed lint copy + the CI gate,
from the first push: the standard the plugin installs is the standard it lives under.

### Fixed

- `payload/hooks/pre-push` captured `$?` after an `if` statement, so the exit-2 branch was dead
  code (POSIX: a failed `if` with no `else` exits 0) and a broken `.repo-standard.json` was
  misdiagnosed as doc drift. The hook now runs the lint bare and captures the status on the next
  line; both diagnosis branches are fixture-proven — a broken config must print "fix the config,
  not the docs" and must not print the drift line.
