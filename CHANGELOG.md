# Changelog

All notable changes to **repo-standard-toolkit** are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semantic versioning](https://semver.org/).

Maintenance rule: every user-facing change lands an entry under `[Unreleased]` in the matching
category. Cutting a tag renames `[Unreleased]` to the version + date, bumps
`.claude-plugin/plugin.json` and the payload lint's `REPO_STANDARD_LINT_VERSION` in the same
commit (a standing test locks the pair), and opens a fresh `[Unreleased]`. A pulled release
keeps its section, tagged `[YANKED]` after the date.

## [Unreleased]

### Changed

- The README template now carries a conditional CI-badge TODO: when the target repo has a
  GitHub remote, the scaffold inserts a badge for the exact workflow it installed (real slug
  from `git remote get-url origin`, real filename) above the tagline; a remote-less repo gets
  no badge — a badge pointing nowhere is a fabricated claim. A Documentation/docs-pages
  section is deliberately NOT templated: a greenfield repo has nothing to link, so the
  hub-and-spoke pattern lives in the skill's reconcile guidance (step 6) for READMEs that
  have outgrown their front page, with the RS-shadow basename and `docs.extra` governance
  rules spelled out.
- The README is now a hub, not a wall: deep-dive material moved to three governed docs pages —
  [Enforcement](docs/enforcement.md) (the 14 checks as a table, the ruleset, the hook),
  [Configuration](docs/configuration.md), and [Design](docs/design.md) (the load-bearing
  principle, the origin, and the deliberate rejections, now public instead of living only in
  commit messages). The README keeps Quick Start, the two-layer table, Caveats, and short
  linked summaries; a badge row (CI, release, license, dependencies-none) replaces nothing but
  says only what is live. The new pages are listed in `docs.extra`, so the voice ban, TODO
  sweep, placeholder sweep, and shadow check govern them like every other meta doc, and the
  status line's "14 lint checks" is a machine-bound count against the lint's own check
  header — the stat line that cannot go stale.

### Fixed

- The README's install instructions and two test comments pointed at the catalog's pre-rename
  repo name (`runverdict/claude-plugins`). The canonical catalog repo is `runverdict/plugins`
  — the old name resolved only through GitHub's rename redirect — and the wiring test now pins
  the canonical name.
- Public-readiness pass (adversarially reviewed before flipping the repo public): two "cannot
  merge" blocking overclaims that survived the 0.2.0 honesty scrub in CONVENTIONS §3 and
  CONTRIBUTING now say what is true (a violating template reddens the build); RS-license's
  documentation claimed "every manifest" when the check reads the two JSON manifests — all
  five statements of that claim (docs, template, lint header) now name exactly what runs;
  provenance links to the private parent toolkit are de-linked (they 404 for public readers);
  the standing-tests count scan is scoped to the README so the dated 0.2.0 block stays
  historical; the suite descriptions in acceptance/README and two test headers caught up with
  reality (no marketplace manifest, SS8/SS9 documented); the skill gains the plugin-manifest
  edit grant its backfill step documents, plus cross-link guidance for docs living at
  non-root locations; and the templates stop attributing the bold tagline and Caveats section
  to standard-readme — they are house additions, now labeled as such.

## [0.2.0] - 2026-07-17

### Added

**The generic enforcement core** (`payload/acceptance/test-repo-standard.mjs`)
- The proven project-meta lint from `ai-readiness-review-toolkit` (a private Verdict toolkit;
  PM1–PM8), generalized into a configurable, dependency-free standing test any repo commits and
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

**The proof that it holds** (11 standing tests, zero npm dependencies)
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
  — when the text is a recognizable standard license — requires each JSON manifest it reads
  (`.claude-plugin/plugin.json`, `package.json`) that declares a `license` field (string form
  only; the deprecated npm object/array form reddens) and the README's License section to name
  the same id, GNU `-only`/`-or-later` suffixes accepted. What cannot be compared is a named skip, never an implied agreement: an
  unrecognized text skips the whole agreement leg, a manifest with no license field skips the
  manifest leg. The fingerprint knows MIT-0 and refuses to guess MIT from the shared grant
  sentence alone — a text is recognized by what distinguishes it, or it is `unrecognized`.

**RS-placeholders — hand-copied templates cannot pass half-filled**
- `fill-template` refuses an unfilled placeholder, but a template copied by hand never meets
  the engine. The new `placeholders` check reddens on any surviving `{{PLACEHOLDER}}` token in
  a governed doc or the license file — fenced code blocks deliberately included, because
  fenced install/usage examples are exactly where template placeholders live. Inline-code and
  quoted mentions stay exempt in prose only; inside a fence a quote is code syntax (a JSON
  example quotes its every value), so fences are scanned raw.

**RS-shadow — one governed copy per doc, and sensing that knows where docs live**
- GitHub serves README and every community health file with precedence `.github/` > root >
  `docs/`, so a stale copy in a higher-precedence location replaces the governed one on the
  repo page while the content checks stay green. The new `shadow` check reddens when a
  governed doc's basename — README, changelog, conventions, stable docs, the manifest doc, and
  `docs.extra` alike — exists in more than one of the three locations. `sense-state` senses
  the same three locations: a doc living only in
  `.github/` is audited (never re-scaffolded at root), the sensed path is reported, and a
  cross-location duplicate prints a DUPLICATE warning; the skill reconciles a doc where it
  lives and leaves resolving duplicates to the operator.

**Recorded scaffold provenance** (`.repo-standard.json` → `scaffold`)
- The skill records which plugin version produced the repo's governance and the operator's
  confirmed answers in a `scaffold` block (`{ pluginVersion, answers }`): a re-run pre-fills
  its questions from the block and re-asks only what is missing, `sense-state` reports the
  recorded version ("scaffolded by plugin 0.1.0"), and the repo can answer "which standard
  version governs me?" with the plugin gone. The lint validates the block's shape (semver
  version, PLACEHOLDER → string answers) and never varies enforcement by it.

**Version-directed lint upgrades**
- The payload lint now carries a machine-readable `REPO_STANDARD_LINT_VERSION` constant
  (printed on every run, locked to the plugin version by a standing test). When an installed
  lint differs from the payload, `sense-state` reads the constant from both copies and directs
  the move — `upgrade` (payload newer), `downgrade` (payload older: a loud stale-plugin
  warning, and the skill stops rather than regressing the committed gate while calling it an
  upgrade), or `local-edit` (same version, different bytes: diff and ask). Byte-difference
  alone can no longer be mislabeled an upgrade.

**The gate cannot be wedged or hijacked** (`payload/workflows/*`, `payload/rulesets/`)
- Both payload workflows now trigger on `merge_group` alongside push and pull_request — the
  moment the acceptance check is made required on a repo using a merge queue, queued PRs wait
  on checks fired by the queue's own event, and a workflow without the trigger deadlocks the
  queue.
- `actions/checkout` is pinned to a full commit SHA (verified against the upstream tag, named
  in a trailing comment) instead of a movable tag — OpenSSF Scorecard's Pinned-Dependencies —
  and `actions/setup-node` is dropped entirely: the lint and suite run on Node built-ins
  (18+ floor) and every ubuntu-latest image ships a newer Node on PATH, so the gate carries
  one less third-party action.
- `payload/rulesets/repo-standard.json` — a GitHub branch ruleset that makes the `test` check
  REQUIRED on the default branch (plus: no deletions, no force pushes, changes via PR, strict
  up-to-date checks). It ships `disabled` — fully configured but inert, POSTable on every
  GitHub plan (the `evaluate` dry-run mode is Enterprise-only, so it cannot be the default) —
  and flipping it to `active` is the operator's deliberate act. Every required check pins
  `integration_id` 15368 (the GitHub Actions app), so a hand-posted commit status cannot
  satisfy the gate. A standing test locks the required contexts and the workflows' job ids to
  the SAME SET, both directions — a phantom context would wedge every merge once active — and
  rejects job-level display names, which would change the check context out from under the
  ruleset.
- The scaffold skill offers the ruleset (new step 9, silence = no) once the suite is green —
  and probes first with a read-only ruleset GET, so the question only reaches operators whose
  plan can take it: GitHub gates rulesets on free-plan private repos, and an operator there
  gets the honest blocking-status line in the recap instead of a doomed offer. When the probe
  clears, the apply is idempotent (an existing `repo-standard` ruleset is never duplicated);
  without `gh`, the manual Settings path is printed. The pre-push hook, install output, and README no longer say
  "CI gates this push" — a workflow run without a required status check blocks nothing, and
  the honest phrasing now points at the ruleset that makes it block.
- A new `test-gate-posture` standing test pins all of the above.

### Changed

- The scaffold skill's step-2 confirmation is now skippable when there is nothing to decide —
  every plan action `audit`/`keep` and no value missing — so a correct no-op re-run no longer
  has to interrogate the operator to approve nothing (previously the written step forced a
  pointless confirmation, and a correct run had to deviate from it).
- The skill's recap rules now require skips to be reported as skips ("N passed, 1 skipped
  (RS-lockstep: …)", N being whatever the lint printed), never folded into a pass count — a
  recap claiming "all checks pass" over a skipped check inflated exactly the claim this
  toolkit polices.

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
