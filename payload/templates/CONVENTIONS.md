# Conventions

House rules for building and maintaining **{{PROJECT_NAME}}**. Numbered so reviews and commit
messages can cite a rule as §N. Sections are contiguous from §1 — the hygiene lint reddens the
build on a gap or a duplicate.

## 1. What this project is (and is not)

<!-- TODO(scaffold): two or three sentences of scope — the job this project does, and the
adjacent jobs it deliberately does NOT do. The "is not" half prevents scope creep in review. -->

## 2. Repository layout

<!-- TODO(scaffold): a short table or list of the top-level directories and what belongs in
each, so a new contributor knows where a change goes. Keep it current — layout drift starts
here. -->

## 3. Writing voice

Dense, specific, honest. Tables for matrices, prose for reasoning. No marketing language — the
hygiene lint reddens the build on superlatives ("seamless", "world-class", "cutting-edge", …)
and on "simply" (if it were simple, the sentence would not need the word). No unexplained
acronyms on first use. American spelling.

## 4. Versioning and releases

[Semantic versioning](https://semver.org/). Every user-facing change lands a CHANGELOG entry
under `[Unreleased]` in the same PR. Cutting a release renames `[Unreleased]` to the dated
version, bumps the version manifest in the same commit, and opens a fresh `[Unreleased]` —
the lint holds the newest CHANGELOG version and the manifest in lockstep once a first release
exists. Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`).

## 5. Project-meta docs standard (README / CHANGELOG / CONVENTIONS)

The top-level markdown is the repo's front matter, held to a fixed standard by the committed
`acceptance/test-repo-standard.mjs` — the build fails the moment it drifts. Grounded in the
published specs, not invented here:

- **CHANGELOG → [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).** Under every
  version, the ONLY `###` subsections allowed are the six canonical change categories —
  **Added · Changed · Deprecated · Removed · Fixed · Security** — grouped (one heading per
  category per version). `[Unreleased]` stays at the top; concrete versions are
  reverse-chronological, valid semver, newest matching the version manifest. A pulled release
  keeps its section, tagged `[YANKED]` after the date.
- **README → [standard-readme](https://github.com/RichardLitt/standard-readme).** Exactly one
  H1; a short **bold tagline** immediately after it (never a blockquote); **Install**,
  **Usage**, and **Contributing** sections; a **Caveats**/limitations section (a standard that
  ships its limits); and the **License** section LAST.
- **CONVENTIONS.** This file's numbered `## N.` sections are contiguous from §1 — no gaps, no
  duplicates.
- **Counts are machine-verified, not trusted.** Any count claim declared in
  `.repo-standard.json` (e.g. "N standing tests") must equal the real repo fact wherever it
  appears, and cross-doc numbers must agree — a forgotten count reddens the build instead of
  shipping a lie.
- **Voice (§3) extends here.** No marketing superlatives and no "simply" in any meta doc.
- **Stable meta files** — SECURITY, CONTRIBUTING, and CODE_OF_CONDUCT (the
  [Contributor Covenant](https://www.contributor-covenant.org/)) exist and open with an H1.
- **LICENSE is lint-governed too.** A license file exists at the repo root; when its text is a
  recognizable standard license, every manifest that declares a license field and the README's
  License section must name the same id. What cannot be compared — an unrecognized text, a
  manifest without the field — is a loud named skip, never a silent pass.
- **No shadowed meta files.** A governed doc exists in exactly one of `.github/`, the repo
  root, or `docs/`. For README and the community health files GitHub serves only the
  highest-precedence copy, and for every governed doc a second copy is drift the content
  checks cannot see.
- **No unfinished scaffolds.** No `TODO(scaffold)` marker and no unfilled double-braced
  template token survives in a governed doc — the lint reddens on either, so a half-written or
  hand-copied scaffold cannot pass CI while looking done.

The lint is installed and updated by
[`repo-standard-toolkit`](https://github.com/runverdict/repo-standard-toolkit); this repo owns
the enforcement (the committed lint + CI), the plugin only regenerates it. Repo-specific scope
— which counts are checked, which docs are in play — lives in `.repo-standard.json`.
