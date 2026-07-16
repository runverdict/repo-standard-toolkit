---
name: scaffold
description: Bootstrap or reconcile enterprise repo hygiene in the current repo — sense greenfield vs. mid-project, scaffold the missing meta docs (README / CHANGELOG / CONVENTIONS / CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / LICENSE) from standards-grounded templates, bring drifted ones into compliance without clobbering prose, and install the committed dependency-free lint + CI gate so the standard polices itself on every push with or without Claude. Idempotent — safe to re-run on any repo at any maturity. Use on a fresh repo, on a repo whose front matter has drifted, or to adopt the standard mid-project.
allowed-tools: Read Grep Glob AskUserQuestion Write(README.md) Write(CHANGELOG.md) Write(CONVENTIONS.md) Write(CONTRIBUTING.md) Write(CODE_OF_CONDUCT.md) Write(SECURITY.md) Write(LICENSE) Write(.repo-standard.json) Write(.github/workflows/*) Edit(README.md) Edit(CHANGELOG.md) Edit(CONVENTIONS.md) Edit(CONTRIBUTING.md) Edit(CODE_OF_CONDUCT.md) Edit(SECURITY.md) Edit(.repo-standard.json) Edit(package.json) Bash(ls *) Bash(mkdir -p acceptance*) Bash(mkdir -p .github/workflows*) Bash(cp *payload/*) Bash(git status*) Bash(git log *) Bash(git remote *) Bash(node *harness/sense-state.mjs *) Bash(node *harness/fill-template.mjs *) Bash(node acceptance/test-repo-standard.mjs*) Bash(node acceptance/test-*.mjs*) Bash(for t in acceptance/test-*.mjs*)
---

# Scaffold

Bring the current repo up to the repo standard — the published-spec front matter (Keep a
Changelog, standard-readme, Contributor Covenant, SemVer) plus the **committed enforcement**
that keeps it true: `acceptance/test-repo-standard.mjs`, its `.repo-standard.json` scope config,
and the CI workflow that runs it on every push. The skill generates; the installed lint
enforces. After this session the plugin is out of the loop by design — a contributor with vim
and no AI hits the same gate.

## When to use

- A greenfield repo that should start immaculate from push #1
- A mid-project repo adopting the standard — existing docs are reconciled, never clobbered
- A governed repo after drift, or after this plugin ships a newer payload lint (re-run = upgrade)
- NOT for code linting, tests, or security review — this governs repo front matter only
- NOT a substitute for reading the generated prose: the operator reviews everything this
  skill writes before it is committed

## Prerequisites

- The target repo is the current working directory (any language — the enforcement needs only
  Node 18+ in CI, nothing else changes)
- Nothing else. The skill senses state itself; never assume a prior run.

## Steps

1. **Sense — never assume.** Run
   `node ${CLAUDE_PLUGIN_ROOT}/harness/sense-state.mjs --target . --json`
   and read the classification (`greenfield` / `partial` / `governed`), the per-artifact plan,
   and the `derived` values. Re-run this even if you scaffolded this repo earlier in the same
   conversation — idempotency comes from sensing the tree, not from remembering what you did.

2. **Confirm the plan with the operator.** Present the classification, the plan table, and the
   derived placeholder values. Ask (AskUserQuestion) for what is genuinely theirs to decide:
   license (`Apache-2.0` recommended default / `MIT` / keep existing), the **copyright holder**
   (the LICENSE line and the README's `© holder` footer — legally meaningful, never guessed;
   suggest the git author or org name as the option, but they choose), the security-report and
   code-of-conduct contact addresses, and the tagline if none is derivable. The copyright YEAR
   comes from the repo's first commit (`git log --reverse`) or, for a repo with no history,
   from the operator. Never invent a contact address, and never guess a license for a repo that
   already has one — `sense-state` derives it from the manifest or a recognizable LICENSE text
   (`derived.licenseId`; an `unrecognized` value means read the LICENSE file yourself and
   confirm with the operator). If a value is unknowable and the operator is absent, leave the
   placeholder-bearing artifact unscaffolded and say so in the recap rather than shipping a
   fabricated value.

3. **Write the enforcement scope first** — `.repo-standard.json` — so every later step can run
   the lint. Start from `${CLAUDE_PLUGIN_ROOT}/payload/repo-standard.json` (the default scope)
   and tune it to the repo, obeying its inline `//` doc keys. Declare a machine-checked count
   ONLY for a numeric claim with a countable source in this repo (e.g. `acceptance/test-*.mjs`
   for "N standing tests") — a count you cannot source is a lie the lint would then enforce.
   If the repo already has a `.repo-standard.json`, merge key-by-key and quote every change in
   the recap; operator customizations win over defaults.

4. **Install the lint verbatim.**
   `mkdir -p acceptance && cp ${CLAUDE_PLUGIN_ROOT}/payload/acceptance/test-repo-standard.mjs acceptance/`
   The payload file is copied byte-identical — never hand-edit it into a target (repo-specific
   scope belongs in the config; a forked lint stops being upgradeable). If `sense-state` said
   `upgrade` (an installed copy differs from the payload), check `git status` for that path
   FIRST: uncommitted local edits would be unrecoverable, so surface them and get the
   operator's go-ahead before replacing; a committed old copy is safely replaced (git keeps
   the history) — either way the replacement is named in the recap.

5. **Scaffold what is missing.** For each `scaffold` action in the plan, fill the matching
   `${CLAUDE_PLUGIN_ROOT}/payload/templates/` file with
   `node ${CLAUDE_PLUGIN_ROOT}/harness/fill-template.mjs --template <tpl> --out <path> --set KEY=VALUE …`
   using the step-2 values (LICENSE uses `LICENSE-Apache-2.0.txt` or `LICENSE-MIT.txt`; the MIT
   year comes from `git log --reverse` or the operator, never from guessing). Do not pass
   `--force`: the engine refusing to overwrite means the plan is stale — re-sense instead of
   forcing. Then replace every `TODO(scaffold)` comment with real prose grounded in the actual
   repo — read the entry points, manifests, and code before writing Install/Usage/Background;
   SECURITY's GitHub-reporting bullet is added only when a real remote exists (its TODO says
   how), so a remote-less repo ships the email channel alone, never a fabricated link. Never
   write a capability, benchmark, user count, or endorsement you cannot verify from the repo
   itself; an honest thin section beats a padded false one, and the Caveats section is where
   the limits go. The lint reddens on any `TODO(scaffold)` left behind, so an unfinished
   scaffold cannot pass CI silently. After scaffolding LICENSE, backfill the manifest's license
   field (`package.json` / plugin manifest) when one exists without it — the manifest and the
   LICENSE file must agree, and the edit goes in the recap.

6. **Reconcile what exists.** Run `node acceptance/test-repo-standard.mjs` from the repo root.
   For every failure on a pre-existing doc, make the smallest edit that satisfies the standard
   and preserve the author's prose: an ad-hoc CHANGELOG `### Notes` section is re-homed under
   the right canonical category (as bullets or a bold lead-in), never deleted; a stale count is
   corrected to the machine-derived number; a missing README section is added as a skeleton for
   the operator to fill, marked in the recap. Never rewrite a paragraph wholesale to "improve"
   it — voice violations get the minimal word-level fix. Every reconcile edit is quoted
   (before → after) in the recap; nothing is silent.

7. **Install the CI gate.** `sense-state` reports the gate as present only when a workflow runs
   the whole suite (the canonical for-loop) or the lint by name — a workflow that happens to run
   one unrelated acceptance test is not a gate. When the plan says `install`: if the repo has
   other pre-existing `acceptance/test-*.mjs` files, run them ALL first. If any pre-existing
   test is red, install `${CLAUDE_PLUGIN_ROOT}/payload/workflows/repo-standard-scoped.yml`
   (verbatim — never hand-author workflow YAML) and tell the operator why: a gate must not be
   born red on someone else's tests. When they are green or absent, install
   `${CLAUDE_PLUGIN_ROOT}/payload/workflows/repo-standard.yml` — the full-suite gate with a
   read-only token. Destination filename is deterministic, not a choice:
   `.github/workflows/test.yml` when the repo has no workflows at all (the conventional name for
   a repo's only gate), else `.github/workflows/repo-standard.yml` (never collide with existing
   files). Never edit an existing workflow file. On a re-run, if the installed gate is the
   SCOPED payload variant and the full suite now passes, upgrade it to the full-suite workflow
   and say so in the recap — the scoped gate is a stopgap, not a destination.

8. **Verify to green, honestly.** Run `node acceptance/test-repo-standard.mjs` and iterate steps
   5–6 until IT exits 0 — that is the gate you installed and the only one you own. Then run the
   rest of the suite for information: a pre-existing test that was already red is the
   operator's, NOT yours to fix (that is exactly why step 7 scoped the gate) — report it in the
   recap and stop; silently fixing someone's unrelated test is scope creep, and iterating on it
   forever is a deadlock. If green requires a judgment call that belongs to the operator (a
   count claim that looks intentional but does not match, a license conflict), stop and ask
   rather than guessing — leave the tree consistent either way. Do not commit unless asked;
   when asked, use a conventional commit
   (`chore(repo-standard): scaffold hygiene standard + committed enforcement`).

## Automated vs. manual recap

End every run with two lists. **Automated:** every file created / modified / upgraded, one line
each, with the reconcile before→after quotes and which template or engine produced it.
**Manual:** what only the operator can finish — reviewing the generated prose, supplying any
contact/tagline left open, committing and pushing, and (once pushed) confirming the CI gate ran.
State plainly that the standard is now enforced by the committed lint in CI, not by this plugin
— removing the plugin changes nothing about enforcement.

## What feeds the next skill

Nothing downstream in this plugin — that is the point. The committed
`acceptance/test-repo-standard.mjs` + `.repo-standard.json` + the CI workflow are the durable
interface: they police every future push without the agent. Re-invoking this skill later is
always safe (sense → reconcile → keep), and is the upgrade path when the plugin ships a newer
payload lint.
