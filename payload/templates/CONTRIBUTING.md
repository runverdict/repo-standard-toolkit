# Contributing

Thanks for considering a contribution to **{{PROJECT_NAME}}**. The essentials are below; the full
house rules live in [`CONVENTIONS.md`](CONVENTIONS.md).

## Prerequisites

- **Node.js 18+** — the standing tests under `acceptance/` use only Node built-ins (no
  `npm install` needed to run them).
<!-- TODO(scaffold): add the project's real toolchain prerequisites (runtime, package manager,
build tools) — the line above covers only the hygiene gate. -->

## The gate

The repo standard (README / CHANGELOG / CONVENTIONS structure, machine-checked counts, voice) is
enforced by a committed, dependency-free lint that CI runs on every push. Run the standing suite
before you push, and keep it green:

```bash
for t in acceptance/test-*.mjs; do node "$t" || exit 1; done
```

A green suite is the bar for a merge.

## What a good change looks like

- **Keep the changeset complete.** A change updates any affected docs — README, CHANGELOG entry
  under `[Unreleased]`, CONVENTIONS — in the **same** PR. Docs are part of the change, not a
  follow-up; the hygiene gate reddens on stale counts and drifted structure.
- **Encode determinizable claims in a test, not in prose.** If your change makes a claim a
  machine can check, add or extend a standing `acceptance/test-*.mjs` for it.
<!-- TODO(scaffold): add project-specific quality rules (test strategy, style, review
expectations). -->

## Pull requests

- Branch off `{{DEFAULT_BRANCH}}`; PRs target `{{DEFAULT_BRANCH}}`.
- **Conventional commits** (`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`).
- Describe what you changed and why, and confirm the suite is green.

By contributing you agree your work is licensed under the repository's
[{{LICENSE_ID}}](LICENSE) license, and you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).
