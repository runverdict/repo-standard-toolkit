#!/usr/bin/env node
/*
 * test-lint-behavior.mjs — mutation coverage for the payload lint (the shipped enforcement).
 *
 * WHY: a check that cannot redden is not a gate. This test materializes a KNOWN-CLEAN fixture
 * repo in a temp dir, proves the shipped payload/acceptance/test-repo-standard.mjs passes it,
 * then applies one targeted mutation per rule and proves the lint fails with the right check
 * named. It also proves the exemptions (quoted mentions, fenced code, properNouns, `under`
 * region scoping) do NOT fire, that skips are loud, and that the two failure classes keep their
 * exit codes (2 = broken config, 1 = drifted docs, 0 = clean).
 *
 * Guards:
 *   LB-CLEAN      the clean fixture passes (exit 0) and the run is byte-deterministic.
 *   LB-M-*        one mutation per lint rule → exit 1 and the right RS-id in the output.
 *   LB-C-*        config mutations → exit 2, doc checks not run, offending key named.
 *   LB-S-*        skips and reasoned disables are printed, loud, and honored.
 *
 * The fixture exercises every configurable surface: manifest reconcile, requireSections,
 * minSections, extraBanned + properNouns, glob / file+lineRegex / agreement-only counts,
 * minMentions, `under` scoping, lockstep via auto-detected package.json.
 *
 * Dependency-free: `node acceptance/test-lint-behavior.mjs`.
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LINT_SRC = readFileSync(join(ROOT, 'payload', 'acceptance', 'test-repo-standard.mjs'), 'utf8')

let pass = 0, fail = 0
const check = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`) } catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`) } }

// ─────────────────────────────────────────────────────────── the known-clean fixture
const BASE_CONFIG = {
  version: 1,
  manifest: { file: 'MANIFEST.md', statuses: ['UNCHANGED', 'NEW'] },
  readme: { requireSections: ['usage', 'caveat|limitation'] },
  conventions: { minSections: 3 },
  voice: { extraBanned: ['synergy'], properNouns: ['Seamless Deploy'] },
  counts: {
    widgets: { pattern: '(\\d+)\\s+widget', glob: 'src/widget-*.txt', minMentions: 2 },
    gizmos: { pattern: '([\\d,]+)\\s+gizmos\\b' },
    rows: { pattern: 'of\\s+(\\d+)\\s+rows', file: 'data/rows.txt', lineRegex: '^row:', docs: ['README.md'] },
    sprockets: { pattern: '(\\d+)\\s+sprockets', docs: ['CHANGELOG.md'], under: '^\\[Unreleased\\]' },
  },
  stableDocs: ['SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md'],
}

const baseFiles = () => ({
  '.repo-standard.json': JSON.stringify(BASE_CONFIG, null, 2) + '\n',
  'package.json': '{ "name": "fixture", "version": "1.2.3" }\n',
  'src/widget-a.txt': 'w\n',
  'src/widget-b.txt': 'w\n',
  'src/widget-c.txt': 'w\n',
  'data/rows.txt': 'row: 1\nrow: 2\n',
  'README.md': [
    '# fixture', '',
    '**A test fixture repo for the repo-standard lint.**', '',
    '## Install', '', 'Clone it.', '',
    '## Usage', '', 'This repo has 3 widget files and 7 gizmos, loaded from 2 of 2 rows.', '',
    '## Caveats', '', 'Known limits only. Built on Seamless Deploy.', '',
    '## Contributing', '', 'PRs welcome.', '',
    '## License', '', 'MIT.', '',
  ].join('\n'),
  'CHANGELOG.md': [
    '# Changelog', '',
    'Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).', '',
    '## [Unreleased]', '',
    '### Added', '',
    '- A sprocket pipeline carrying 5 sprockets; still 3 widget files and 7 gizmos.', '',
    '## [1.2.3] — 2026-01-01', '',
    '### Added', '',
    '- Initial release with 2 sprockets.', '',
  ].join('\n'),
  'CONVENTIONS.md': [
    '# Conventions', '',
    '## 1. Scope', '', 'A fixture.', '',
    '## 2. Voice', '', 'No marketing voice, and no "synergy" (extra house ban).', '',
    '## 3. Meta docs standard', '',
    'CHANGELOG follows Keep a Changelog (keepachangelog.com): only Added / Changed / Deprecated /',
    'Removed / Fixed / Security. README follows standard-readme: Install, Usage, Contributing,',
    'License last.', '',
  ].join('\n'),
  'MANIFEST.md': [
    '# Manifest', '',
    '| path | status | note |', '|---|---|---|',
    '| `a` | UNCHANGED | x |', '| `b` | NEW | x |', '| `c` | NEW | x |', '',
    'Totals: **1 UNCHANGED · 2 NEW · 3 total.**', '',
  ].join('\n'),
  'SECURITY.md': '# Security Policy\n\nReport privately.\n',
  'CONTRIBUTING.md': '# Contributing\n\nBe kind.\n',
  'CODE_OF_CONDUCT.md': '# Code of Conduct\n\nCovenant.\n',
})

const runLint = (mutate) => {
  const files = baseFiles()
  if (mutate) mutate(files)
  const tmp = mkdtempSync(join(tmpdir(), 'rs-lint-behavior-'))
  try {
    for (const [rel, content] of Object.entries(files)) {
      if (content === null) continue // null = delete from fixture
      mkdirSync(join(tmp, dirname(rel)), { recursive: true })
      writeFileSync(join(tmp, rel), content)
    }
    mkdirSync(join(tmp, 'acceptance'), { recursive: true })
    writeFileSync(join(tmp, 'acceptance', 'test-repo-standard.mjs'), LINT_SRC)
    try {
      const out = execFileSync('node', [join(tmp, 'acceptance', 'test-repo-standard.mjs')], { encoding: 'utf8' })
      return { code: 0, out }
    } catch (e) {
      return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// mutation helper: assert exit code + that every needle appears in the output
const expect = (name, mutate, code, ...needles) => check(name, () => {
  const r = runLint(mutate)
  assert.equal(r.code, code, `expected exit ${code}, got ${r.code}\n--- lint output ---\n${r.out}`)
  for (const n of needles) assert.ok(r.out.includes(n), `output should contain "${n}"\n--- lint output ---\n${r.out}`)
})
const editConfig = (files, edit) => { const c = JSON.parse(files['.repo-standard.json']); edit(c); files['.repo-standard.json'] = JSON.stringify(c, null, 2) + '\n' }

console.log('lint-behavior standing test (mutation coverage of the payload lint)')

// ───────────────────────────────────────────────────────────────────────── clean
check('LB-CLEAN the known-clean fixture passes (exit 0) and the run is deterministic', () => {
  const a = runLint(null), b = runLint(null)
  assert.equal(a.code, 0, `clean fixture should pass\n--- lint output ---\n${a.out}`)
  assert.equal(a.out, b.out, 'two runs over the same fixture must print byte-identical output')
  assert.ok(a.out.includes('0 failed'), 'summary states 0 failed')
})

// ─────────────────────────────────────────────────────────────────── doc mutations
expect('LB-M-changelog an ad-hoc "### Notes" subsection reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('### Added', '### Notes\n\n- x\n\n### Added') }, 1,
  '✗ RS-changelog', 'non-canonical')
expect('LB-M-changelog-dup a repeated "### Added" in one version block reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('- A sprocket', '- x\n\n### Added\n\n- A sprocket') }, 1,
  '✗ RS-changelog', 'repeats')
expect('LB-M-changelog-h2 a non-version H2 ("## Roadmap") reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] += '\n## Roadmap\n\n- soon\n' }, 1,
  '✗ RS-changelog', 'not a version heading')
expect('LB-M-changelog-semver a non-semver version heading reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('## [1.2.3] — 2026-01-01', '## [v1.2] — 2026-01-01') }, 1,
  '✗ RS-changelog', 'not valid semver')
expect('LB-M-changelog-order ascending version order reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('## [Unreleased]', '## [Unreleased]\n\n## [0.9.0] — 2025-01-01\n\n### Fixed\n\n- old\n').replace('with 2 sprockets', 'with 2 sprockets kept') }, 1,
  '✗ RS-changelog', 'must descend')
expect('LB-M-changelog-unreleased-pos [Unreleased] not FIRST reddens RS-changelog (Keep a Changelog: on top)',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('## [Unreleased]\n\n### Added\n\n- A sprocket pipeline carrying 5 sprockets; still 3 widget files and 7 gizmos.\n', '').replace('- Initial release with 2 sprockets.', '- Initial release with 2 sprockets.\n\n## [Unreleased]\n\n### Added\n\n- A sprocket pipeline carrying 5 sprockets; still 3 widget files and 7 gizmos.') }, 1,
  '✗ RS-changelog', 'must be the FIRST')
expect('LB-M-changelog-nodate a dated version heading without its ISO date reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('## [1.2.3] — 2026-01-01', '## [1.2.3]') }, 1,
  '✗ RS-changelog', 'ISO release date')
expect('LB-M-changelog-dupver a repeated version section reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] += '\n## [1.2.3] — 2026-01-01\n\n### Fixed\n\n- again\n' }, 1,
  '✗ RS-changelog', 'repeats a version heading')
expect('LB-M-changelog-prerelease a prerelease listed above its same-triple release reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('## [1.2.3] — 2026-01-01', '## [1.2.3-alpha.1] - 2025-12-01\n\n### Added\n\n- alpha cut\n\n## [1.2.3] — 2026-01-01').replace('{ "name": "fixture", "version": "1.2.3" }', '{ "name": "fixture", "version": "1.2.3-alpha.1" }') }, 1,
  '✗ RS-changelog', 'must descend')
expect('LB-S-changelog-hyphen the spec\'s hyphen date separator is accepted alongside the em dash (stays green)',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('## [1.2.3] — 2026-01-01', '## [1.2.3] - 2026-01-01') }, 0)
expect('LB-M-lockstep a manifest version that disagrees with the newest dated CHANGELOG version reddens RS-lockstep',
  (f) => { f['package.json'] = '{ "name": "fixture", "version": "9.9.9" }\n' }, 1,
  '✗ RS-lockstep', 'bump both in lockstep')
expect('LB-M-readme-h1 a second H1 reddens RS-readme',
  (f) => { f['README.md'] += '\n# Another title\n' }, 1,
  '✗ RS-readme', 'exactly one H1')
expect('LB-M-readme-tagline a blockquote where the bold tagline belongs reddens RS-readme',
  (f) => { f['README.md'] = f['README.md'].replace('**A test fixture repo for the repo-standard lint.**', '> a quote instead of a tagline') }, 1,
  '✗ RS-readme', 'bold tagline')
expect('LB-M-readme-install a missing Install section reddens RS-readme',
  (f) => { f['README.md'] = f['README.md'].replace('## Install', '## Setup') }, 1,
  '✗ RS-readme', 'Install section')
expect('LB-M-readme-last a section after License reddens RS-readme (License must be LAST)',
  (f) => { f['README.md'] += '\n## Extra\n\nafterthought\n' }, 1,
  '✗ RS-readme', 'License section must be LAST')
expect('LB-M-readme-required a missing configured section (caveat|limitation) reddens RS-readme',
  (f) => { f['README.md'] = f['README.md'].replace('## Caveats', '## Misc').replace('Known limits only.', 'Notes.') }, 1,
  '✗ RS-readme', 'caveat|limitation')

// ── standard-readme fidelity (the spec rules the adversarial pass found unenforced) ──
expect('LB-M-readme-usage a missing Usage section reddens RS-readme (spec: required by default)',
  (f) => { f['README.md'] = f['README.md'].replace('## Usage', '## Examples') }, 1,
  '✗ RS-readme', 'must have a Usage section')
expect('LB-S-readme-docsonly readme.docsOnly waives Install+Usage per the spec\'s documentation-repository exception (stays green)',
  (f) => {
    editConfig(f, (c) => { c.readme = { requireSections: ['caveat|limitation'], docsOnly: true } })
    f['README.md'] = f['README.md'].replace('## Install\n\nClone it.\n\n', '').replace('## Usage\n\n', '## Notes\n\n')
    f['CONVENTIONS.md'] = f['CONVENTIONS.md'].replace('Install, Usage, Contributing,\nLicense last.', 'Contributing, License last.')
  }, 0)
expect('LB-S-readme-badges badges between the H1 and the tagline stay green (the spec\'s own section order)',
  (f) => { f['README.md'] = f['README.md'].replace('**A test fixture repo for the repo-standard lint.**', '[![build](https://img.shields.io/badge/build-passing-green)](https://example.com)\n\n**A test fixture repo for the repo-standard lint.**') }, 0)
expect('LB-M-readme-order a spec section out of the spec\'s order reddens RS-readme',
  (f) => { f['README.md'] = f['README.md'].replace('## Install\n\nClone it.\n\n', '').replace('## Contributing', '## Install\n\nClone it.\n\n## Contributing') }, 1,
  '✗ RS-readme', 'standard-readme fixes the section order')
expect('LB-M-readme-toc a 100+ line README with no Table of Contents reddens RS-readme',
  (f) => { f['README.md'] = f['README.md'].replace('## Caveats', `${'\n<!-- padding -->'.repeat(100)}\n\n## Caveats`) }, 1,
  '✗ RS-readme', 'Table of Contents')
expect('LB-M-readme-longdesc a short description over 120 characters reddens RS-readme',
  (f) => { f['README.md'] = f['README.md'].replace('**A test fixture repo for the repo-standard lint.**', `**${'A very long tagline that runs on and on well past the specification limit for a short description. '.repeat(2)}**`) }, 1,
  '✗ RS-readme', 'under 120 characters')
expect('LB-M-conventions-gap a numbering gap reddens RS-conventions',
  (f) => { f['CONVENTIONS.md'] = f['CONVENTIONS.md'].replace('## 3. Meta docs standard', '## 4. Meta docs standard') }, 1,
  '✗ RS-conventions', 'numbering breaks')
expect('LB-M-conventions-floor gutting below minSections reddens RS-conventions',
  (f) => { f['CONVENTIONS.md'] = f['CONVENTIONS.md'].split('## 3. Meta docs standard')[0] }, 1,
  '✗ RS-conventions')
expect('LB-M-manifest a Totals line that no longer sums reddens RS-manifest',
  (f) => { f['MANIFEST.md'] = f['MANIFEST.md'].replace('**1 UNCHANGED · 2 NEW · 3 total.**', '**2 UNCHANGED · 2 NEW · 4 total.**') }, 1,
  '✗ RS-manifest', 'Totals says 2 UNCHANGED but the table has 1')
expect('LB-M-voice a banned marketing word in prose reddens RS-voice',
  (f) => { f['README.md'] = f['README.md'].replace('Clone it.', 'Clone it for a seamless setup.') }, 1,
  '✗ RS-voice', 'seamless')
expect('LB-M-voice-extra a config-extended banned word reddens RS-voice',
  (f) => { f['README.md'] = f['README.md'].replace('Clone it.', 'Clone it. Great synergy.') }, 1,
  '✗ RS-voice', 'synergy')
expect('LB-M-voice-propernoun removing the properNouns exemption makes the bare product name redden (the exemption is load-bearing)',
  (f) => editConfig(f, (c) => { delete c.voice.properNouns }), 1,
  '✗ RS-voice', 'seamless')
expect('LB-M-counts-stale a grown glob truth (4th widget) against a stale "3 widget" claim reddens RS-counts',
  (f) => { f['src/widget-d.txt'] = 'w\n' }, 1,
  '✗ RS-counts', 'the repo derives 4')
expect('LB-M-counts-disagree a cross-doc disagreement (7 vs 8 gizmos) reddens RS-counts',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('7 gizmos', '8 gizmos') }, 1,
  '✗ RS-counts', 'disagrees across docs')
expect('LB-M-counts-mentions dropping below minMentions reddens RS-counts',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('still 3 widget files and ', '') }, 1,
  '✗ RS-counts', 'minMentions')
expect('LB-M-counts-under removing `under` scoping makes the historical sprocket number collide (proves the scoping is load-bearing)',
  (f) => editConfig(f, (c) => { delete c.counts.sprockets.under }), 1,
  '✗ RS-counts', 'disagrees across docs')
expect('LB-M-reflexivity a CONVENTIONS that stops documenting a canonical category reddens RS-reflexivity',
  (f) => { f['CONVENTIONS.md'] = f['CONVENTIONS.md'].replace('Deprecated /', '/') }, 1,
  '✗ RS-reflexivity', 'Deprecated')
expect('LB-M-reflexivity-ban an extraBanned word the written standard does not document reddens RS-reflexivity',
  (f) => { f['CONVENTIONS.md'] = f['CONVENTIONS.md'].replace(', and no "synergy" (extra house ban)', '') }, 1,
  '✗ RS-reflexivity', 'synergy')
expect('LB-M-stable a deleted stable meta file reddens RS-stable-docs',
  (f) => { f['SECURITY.md'] = null }, 1,
  '✗ RS-stable-docs', 'SECURITY.md must exist')
expect('LB-M-stable-h1 a stable meta file without an H1 reddens RS-stable-docs',
  (f) => { f['CONTRIBUTING.md'] = 'Be kind.\n' }, 1,
  '✗ RS-stable-docs', 'must open with an H1')
expect('LB-M-todos a surviving TODO(scaffold) marker reddens RS-todos',
  (f) => { f['README.md'] = f['README.md'].replace('PRs welcome.', 'PRs welcome. <!-- TODO(scaffold): write the real contributing note -->') }, 1,
  '✗ RS-todos', 'TODO(scaffold)')

// ── the hardenings from the adversarial pass, each locked so the bypass can never reopen ──
expect('LB-M-voice-spaced a hyphenated ban written with a space ("world class") still reddens RS-voice',
  (f) => { f['README.md'] = f['README.md'].replace('Clone it.', 'Clone it, a world class experience.') }, 1,
  '✗ RS-voice', 'world-class')
expect('LB-M-voice-contraction apostrophes in prose cannot swallow a banned word ("It\'s simply ... you\'d")',
  (f) => { f['README.md'] = f['README.md'].replace('Clone it.', "It's simply the cleanest setup you'd want.") }, 1,
  '✗ RS-voice', 'simply')
expect('LB-M-changelog-h4 an ad-hoc H4 subsection under a version reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('### Added', '#### Breaking Changes\n\n- x\n\n### Added') }, 1,
  '✗ RS-changelog', 'only ### category subsections')
expect('LB-M-changelog-decoy relocating the changelog while a root CHANGELOG.md still exists reddens RS-changelog',
  (f) => {
    editConfig(f, (c) => { c.docs = { changelog: 'docs/CHANGELOG.md' } })
    f['docs/CHANGELOG.md'] = f['CHANGELOG.md'] // pristine copy at the configured path
    f['CHANGELOG.md'] = '# Changelog\n\nrotten decoy shadow\n' // the file contributors would open
  }, 1,
  '✗ RS-changelog', 'shadow')
expect('LB-M-readme-setext a setext (=) heading reddens RS-readme (ATX only, so the lint sees what renders)',
  (f) => { f['README.md'] = f['README.md'].replace('## License', 'Sponsors\n=======\n\nBuy now!\n\n## License') }, 1,
  '✗ RS-readme', 'setext')
expect('LB-M-readme-empty-license a content-free License section reddens RS-readme',
  (f) => { f['README.md'] = f['README.md'].replace('## License\n\nMIT.\n', '## License\n') }, 1,
  '✗ RS-readme', 'License section is empty')
expect('LB-M-todos-case a case/space variant ("todo (scaffold)") still reddens RS-todos',
  (f) => { f['README.md'] = f['README.md'].replace('PRs welcome.', 'PRs welcome. <!-- todo (scaffold): finish -->') }, 1,
  '✗ RS-todos')
expect('LB-S-manifest-prose a "| NEW |" inside a prose sentence does not count as an inventory row (stays green)',
  (f) => { f['MANIFEST.md'] = f['MANIFEST.md'].replace('Totals:', 'A file still tracked as | NEW | in the migration sheet.\n\nTotals:') }, 0)
expect('LB-M-manifest-prose the old bypass — totals inflated to absorb a prose "| NEW |" — now reddens RS-manifest',
  (f) => { f['MANIFEST.md'] = f['MANIFEST.md'].replace('Totals:', 'A file still tracked as | NEW | in the migration sheet.\n\nTotals:').replace('**1 UNCHANGED · 2 NEW · 3 total.**', '**1 UNCHANGED · 3 NEW · 4 total.**') }, 1,
  '✗ RS-manifest', 'Totals says 3 NEW but the table has 2')

// ──────────────────────────────────────────────────────── exemptions must NOT fire
expect('LB-S-todos-named NAMING the TODO(scaffold) marker in backticks stays green (a mention is not an unfinished scaffold)',
  (f) => { f['README.md'] = f['README.md'].replace('PRs welcome.', 'PRs welcome. The scaffolder resolves every `TODO(scaffold)` marker.') }, 0)
expect('LB-S-quoted naming a banned word in quotes stays green (a mention is not marketing)',
  (f) => { f['README.md'] = f['README.md'].replace('Clone it.', 'Clone it. We never write "seamless".') }, 0)
expect('LB-S-fenced a banned word inside a fenced code block stays green',
  (f) => { f['README.md'] = f['README.md'].replace('Clone it.', 'Clone it.\n\n```\nexample: seamless\n```') }, 0)

// ───────────────────────────────────────────────────────── config-error class (exit 2)
expect('LB-C-unknown-key an unknown top-level config key exits 2 and names it (doc checks not run)',
  (f) => editConfig(f, (c) => { c.cheks = {} }), 2,
  'unknown top-level key "cheks"', 'doc checks not run')
expect('LB-C-version an unsupported config version exits 2',
  (f) => editConfig(f, (c) => { c.version = 2 }), 2,
  '"version" must be the number 1')
expect('LB-C-bare-false a bare-false check disable exits 2 (disabling demands a stated reason)',
  (f) => editConfig(f, (c) => { c.checks = { voice: false } }), 2,
  'cannot be silently weakened')
expect('LB-C-decoy pointing docs.readme at a non-rendered path exits 2 (anti-decoy)',
  (f) => editConfig(f, (c) => { c.docs = { readme: 'docs/HIDDEN.md' } }), 2,
  'paths GitHub renders')
expect('LB-C-badcount a count pattern without a capture group exits 2',
  (f) => editConfig(f, (c) => { c.counts.widgets.pattern = '\\d+ widget' }), 2,
  'needs a capture group')

// ──────────────────────────────────────────────────────────── loud skips and disables
expect('LB-S-manifest-skip no manifest declared → a printed SKIP line, not a silent pass',
  (f) => { editConfig(f, (c) => { c.manifest = false }); f['MANIFEST.md'] = null }, 0,
  'RS-manifest SKIP', 'no manifest doc declared')
expect('LB-S-disable a reasoned disable skips the broken check LOUDLY and keeps the build green',
  (f) => {
    editConfig(f, (c) => { c.checks = { changelog: { enabled: false, why: 'migrating a legacy changelog' } } })
    f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('### Added', '### Notes\n\n- x\n\n### Added')
  }, 0,
  'changelog is DISABLED in config: migrating a legacy changelog', 'RS-changelog SKIP')
expect('LB-S-noconfig a missing config runs full-strict defaults (fixture violates none of them)',
  (f) => {
    f['.repo-standard.json'] = null
    f['MANIFEST.md'] = null // no config → no manifest declared → skip
    // no config also means no properNouns exemption — the bare product name must go, which is
    // itself the correct default-strict behavior (proven red in LB-M-voice-propernoun).
    f['README.md'] = f['README.md'].replace(' Built on Seamless Deploy.', '')
  }, 0,
  'defaults — no .repo-standard.json')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
