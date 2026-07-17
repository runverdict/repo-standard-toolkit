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

**RS-license — the LICENSE file joins the enforced set**
- The one scaffolded file the lint could not govern (a license text has no H1, so
  RS-stable-docs cannot hold it) was deletable while CI stayed green. The new `license` check
  requires a root license file (LICENSE / LICENCE / COPYING families, `.md`/`.txt` accepted),
  requires it non-empty, fingerprints the text with the same heuristics `sense-state` uses, and
  — when the text is a recognizable standard license — requires the version manifest's
  `license` field (string form only; the deprecated npm object/array form reddens) and the
  README's License section to name the same id, GNU `-only`/`-or-later` suffixes accepted. An
  unrecognized text passes existence and skips agreement as a named, printed skip.

**RS-placeholders — hand-copied templates cannot pass half-filled**
- `fill-template` refuses an unfilled placeholder, but a template copied by hand never meets
  the engine. The new `placeholders` check reddens on any surviving `{{PLACEHOLDER}}` token in
  a governed doc or the license file — fenced code blocks deliberately included, because
  fenced install/usage examples are exactly where template placeholders live; inline-code and
  quoted mentions stay exempt.

**Version-directed lint upgrades**
- The payload lint now carries a machine-readable `REPO_STANDARD_LINT_VERSION` constant
  (printed on every run, locked to the plugin version by a standing test). When an installed
  lint differs from the payload, `sense-state` reads the constant from both copies and directs
  the move — `upgrade` (payload newer), `downgrade` (payload older: a loud stale-plugin
  warning, and the skill stops rather than regressing the committed gate while calling it an
  upgrade), or `local-edit` (same version, different bytes: diff and ask). Byte-difference
  alone can no longer be mislabeled an upgrade.

### Fixed

- The lint rejected Keep a Changelog's own `[YANKED]` vocabulary: the dated-heading rule
  anchored on the date, so a spec-valid `## [x.y.z] - YYYY-MM-DD [YANKED]` heading could never
  pass a lint that claims to enforce that spec. The heading grammar now allows exactly that tag
  (and nothing else after the date); the templates and CONVENTIONS document the yanked-release
  rule, and mutation cases prove both the allowance and that other suffixes still redden.
- `payload/hooks/pre-push` captured `$?` after an `if` statement, so the exit-2 branch was dead
  code (POSIX: a failed `if` with no `else` exits 0) and a broken `.repo-standard.json` was
  misdiagnosed as doc drift. The hook now runs the lint bare and captures the status on the next
  line; both diagnosis branches are fixture-proven — a broken config must print "fix the config,
  not the docs" and must not print the drift line.
