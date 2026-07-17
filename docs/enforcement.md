# Enforcement

What actually polices a governed repo, layer by layer. The short version: a committed,
dependency-free lint runs in CI on every push; an optional GitHub branch ruleset makes that
check required (the only thing that truly blocks a merge); an optional local pre-push hook
saves you the round trip to CI. Only the first two involve any enforcement — the hook is a
convenience and says so itself.

## What gets installed

Into the target repo, all committed, all dependency-free:

- `acceptance/test-repo-standard.mjs` — the standing lint (the full check list below), copied
  byte-identical from this plugin's payload, never hand-edited into a target.
- `.repo-standard.json` — the repo's declared scope. See [Configuration](configuration.md).
- `.github/workflows/test.yml` — the gate: a read-only token running every
  `acceptance/test-*.mjs` on push, pull request, and merge-queue events. Named
  `repo-standard.yml` instead when the repo already has workflows; installed as the lint-only
  scoped variant when pre-existing acceptance tests are red, so the gate is never born red on
  someone else's tests.
- The meta docs themselves, where missing — README, CHANGELOG, CONVENTIONS, CONTRIBUTING,
  CODE_OF_CONDUCT, SECURITY, LICENSE — filled from templates, with every `TODO(scaffold)`
  marker resolved against the real repo before the gate lets them pass.

## The checks

The canon is hardcoded in the lint; config tunes scope only. Exit 1 means the docs drifted
(fix the docs); exit 2 means the config is broken (fix the config); every skipped check is a
printed, named line — never a silent pass.

| Check | What it holds |
|---|---|
| `RS-config` | the config parses, is version 1, and carries no unknown or malformed keys |
| `RS-changelog` | Keep a Changelog shape: `[Unreleased]` on top, the six canonical categories grouped, dated semver headings in descending order, `[YANKED]` accepted |
| `RS-lockstep` | the newest dated CHANGELOG version equals the version manifest (dormant until a first release) |
| `RS-readme` | standard-readme structure: one H1, the bold tagline, required sections, spec section order, License last |
| `RS-conventions` | numbered `## N.` sections contiguous from §1 — no gaps, no duplicates |
| `RS-manifest` | a declared inventory doc's Totals line reconciles with its own table rows |
| `RS-voice` | the marketing-voice ban across the meta-doc set |
| `RS-counts` | every declared numeric claim equals the derived repo fact and agrees across docs |
| `RS-reflexivity` | the CONVENTIONS doc documents the enforced vocabulary (lint ⟺ spec) |
| `RS-stable-docs` | the stable meta files exist and open with an H1 |
| `RS-todos` | no `TODO(scaffold)` marker survives in a governed doc |
| `RS-license` | a root license file exists; a recognizable license text agrees with the JSON manifests' license fields and the README's License section |
| `RS-placeholders` | no unfilled template placeholder survives — fenced code included, because that is where hand-copied templates hide them |
| `RS-shadow` | no governed doc is duplicated across the GitHub-served locations (`.github/` > root > `docs/`) |

## The required-check ruleset

A workflow that runs on every push blocks nothing by itself — a red run turns the badge red
while the merge lands anyway. On GitHub, only a **required status check** stops a merge, and
that requirement lives in a branch ruleset, not in any committed file.

The skill offers `payload/rulesets/repo-standard.json` once the suite is green and the repo
has a GitHub remote — probing first, so the question never reaches a plan that cannot take it
(rulesets cover public repos on every plan, private repos on Pro/Team+). The payload ships
with `"enforcement": "disabled"`: fully configured, inert, POSTable everywhere. Turning it on
is the operator's one deliberate act in Settings, and the required check is pinned to the
GitHub Actions app, so a hand-posted commit status cannot satisfy it. Until the ruleset is
active, a red CI run blocks nothing — the skill and its recap say so rather than implying
otherwise.

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
standard, and a hook can never be. The gate is the same lint, run by CI — and once the repo
requires that check via the branch ruleset, nobody merges past a red run.

The engine refuses rather than surprising you: it never clobbers a pre-push hook it did not
write, it reports instead of writing into `.git/hooks` when `core.hooksPath` points elsewhere
(husky and friends), and it turns away an ungoverned repo. Remove it any time with
`--uninstall`, or just `rm .git/hooks/pre-push`.

There is deliberately **no push-time prompt asking whether to adopt the standard.** Adoption is
a reviewed change to a repo's front matter; it deserves its own session and its own PR, not an
interruption while you are shipping something else — and a prompt you dismiss on every push is
just noise you have trained yourself to ignore.
