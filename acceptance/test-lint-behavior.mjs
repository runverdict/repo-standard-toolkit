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
 * Two rules for adding a case here, both learned from a mutation audit that found six rules
 * surviving deletion with this whole suite green:
 *   1. Assert on the MESSAGE, never a substring of the check's NAME. The `✗` line prints the
 *      check name, so a needle like 'bold tagline' (which is IN the RS-readme name) passes no
 *      matter which assertion fired — a guard that cannot fail.
 *   2. Several assertions share one check name. Plant an input that trips ONLY the one under
 *      test, or an earlier assertion fires first and the rule you meant to prove is untouched.
 * Verify a new case the same way: delete the rule from BOTH lint copies (payload-sync would
 * otherwise redden on the copy instead of the behavior) and confirm this suite goes red.
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
  'package.json': '{ "name": "fixture", "version": "1.2.3", "license": "MIT" }\n',
  'LICENSE': 'MIT License\n\nCopyright (c) 2026 fixture\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software.\n',
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
expect('LB-S-changelog-yanked a spec-valid "[YANKED]" tag after the date stays green (Keep a Changelog\'s own vocabulary)',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('## [1.2.3] — 2026-01-01', '## [1.2.3] — 2026-01-01 [YANKED]') }, 0)
expect('LB-M-changelog-badsuffix any OTHER suffix after the date still reddens RS-changelog (the [YANKED] allowance is not a hole)',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('## [1.2.3] — 2026-01-01', '## [1.2.3] — 2026-01-01 [PULLED]') }, 1,
  '✗ RS-changelog', 'ISO release date')
expect('LB-M-lockstep a manifest version that disagrees with the newest dated CHANGELOG version reddens RS-lockstep',
  (f) => { f['package.json'] = '{ "name": "fixture", "version": "9.9.9" }\n' }, 1,
  '✗ RS-lockstep', 'bump both in lockstep')
expect('LB-M-readme-h1 a second H1 reddens RS-readme',
  (f) => { f['README.md'] += '\n# Another title\n' }, 1,
  '✗ RS-readme', 'exactly one H1')
// NB: RS-readme runs many assertions under ONE check name, and that name literally contains
// "bold tagline" — so a needle like 'bold tagline' is satisfied by the ✗ line itself no matter
// which assertion fired, and cannot tell them apart. Needles here must be substrings of the
// MESSAGE only, never of the check name. These two cases isolate one assertion each.
expect('LB-M-readme-blockquote a blockquote where the short description belongs reddens RS-readme',
  (f) => { f['README.md'] = f['README.md'].replace('**A test fixture repo for the repo-standard lint.**', '> a quote instead of a tagline') }, 1,
  '✗ RS-readme', 'must not be a blockquote')
expect('LB-M-readme-tagline a PLAIN (non-bold) short description reddens RS-readme — the house bold rule is real',
  (f) => { f['README.md'] = f['README.md'].replace('**A test fixture repo for the repo-standard lint.**', 'A test fixture repo for the repo-standard lint.') }, 1,
  '✗ RS-readme', 'needs a bold tagline')
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
expect('LB-M-readme-longdesc a short description of 120+ characters reddens RS-readme',
  (f) => { f['README.md'] = f['README.md'].replace('**A test fixture repo for the repo-standard lint.**', `**${'A very long tagline that runs on and on well past the specification limit for a short description. '.repeat(2)}**`) }, 1,
  '✗ RS-readme', 'less than 120 characters')
expect('LB-S-readme-desc-boundary a 119-char description stays green; the bold markers do not count toward the limit',
  (f) => { f['README.md'] = f['README.md'].replace('**A test fixture repo for the repo-standard lint.**', `**${'x'.repeat(119)}**`) }, 0)
expect('LB-M-conventions-gap a numbering gap reddens RS-conventions',
  (f) => { f['CONVENTIONS.md'] = f['CONVENTIONS.md'].replace('## 3. Meta docs standard', '## 4. Meta docs standard') }, 1,
  '✗ RS-conventions', 'numbering breaks')
expect('LB-M-conventions-floor gutting below minSections reddens RS-conventions',
  (f) => { f['CONVENTIONS.md'] = f['CONVENTIONS.md'].split('## 3. Meta docs standard')[0] }, 1,
  '✗ RS-conventions')
expect('LB-M-manifest a per-status count that no longer matches its rows reddens RS-manifest',
  (f) => { f['MANIFEST.md'] = f['MANIFEST.md'].replace('**1 UNCHANGED · 2 NEW · 3 total.**', '**2 UNCHANGED · 2 NEW · 4 total.**') }, 1,
  '✗ RS-manifest', 'Totals says 2 UNCHANGED but the table has 1')
// every per-status count CORRECT and only the grand total wrong — the one input that reaches
// the sum assertion, which the per-status cases above always trip first and so never exercise.
expect('LB-M-manifest-total a wrong grand total with correct per-status counts reddens RS-manifest',
  (f) => { f['MANIFEST.md'] = f['MANIFEST.md'].replace('· 3 total.**', '· 99 total.**') }, 1,
  '✗ RS-manifest', '!= the row sum')
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
expect('LB-M-license-missing a deleted license file reddens RS-license (deletable-while-green was the hole)',
  (f) => { f['LICENSE'] = null }, 1,
  '✗ RS-license', 'no license file at the repo root')
expect('LB-M-license-empty an empty license file reddens RS-license',
  (f) => { f['LICENSE'] = '' }, 1,
  '✗ RS-license', 'licenses nothing')
expect('LB-M-license-manifest a manifest license disagreeing with the LICENSE text reddens RS-license',
  (f) => { f['package.json'] = '{ "name": "fixture", "version": "1.2.3", "license": "Apache-2.0" }\n' }, 1,
  '✗ RS-license', 'must agree')
expect('LB-M-license-form the deprecated npm object license form reddens RS-license',
  (f) => { f['package.json'] = '{ "name": "fixture", "version": "1.2.3", "license": { "type": "MIT" } }\n' }, 1,
  '✗ RS-license', 'deprecated object/array form')
expect('LB-M-license-readme a README License section naming a different id reddens RS-license',
  (f) => { f['README.md'] = f['README.md'].replace('## License\n\nMIT.', '## License\n\nApache-2.0.') }, 1,
  '✗ RS-license', 'must name the license')
expect('LB-S-license-unrecognized an unrecognizable license text passes existence and SKIPS agreement, loudly',
  (f) => { f['LICENSE'] = 'You may use this for good, not evil.\n' }, 0,
  'RS-license (id agreement) SKIP')
expect('LB-S-license-expression an SPDX expression containing the detected id stays green',
  (f) => { f['package.json'] = '{ "name": "fixture", "version": "1.2.3", "license": "(MIT OR Apache-2.0)" }\n' }, 0)
expect('LB-S-license-copying the GPL convention (COPYING) counts as the license file',
  (f) => { f['COPYING'] = f['LICENSE']; f['LICENSE'] = null }, 0)
expect('LB-S-license-mit0 a self-consistent MIT-0 repo stays green (the fingerprint no longer guesses MIT)',
  (f) => {
    f['LICENSE'] = 'MIT No Attribution\n\nCopyright (c) 2026 fixture\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software, to deal in the Software without restriction.\n'
    f['package.json'] = '{ "name": "fixture", "version": "1.2.3", "license": "MIT-0" }\n'
    f['README.md'] = f['README.md'].replace('## License\n\nMIT.', '## License\n\nMIT-0.')
  }, 0)
expect('LB-S-license-grant-only a grant sentence WITHOUT the notice-preservation condition is unrecognized, not "MIT"',
  (f) => { f['LICENSE'] = 'Copyright (c) 2026 fixture\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software.\n' }, 0,
  'RS-license (id agreement) SKIP')
expect('LB-M-license-second-manifest a license-less plugin manifest cannot hide a disagreeing package.json (EVERY manifest is consulted)',
  (f) => {
    f['.claude-plugin/plugin.json'] = '{ "name": "fixture", "version": "1.2.3" }\n'
    f['package.json'] = '{ "name": "fixture", "version": "1.2.3", "license": "Apache-2.0" }\n'
  }, 1,
  '✗ RS-license', 'package.json declares license "Apache-2.0"')
expect('LB-S-license-manifest-skip a manifest with no license field prints a named manifest-leg SKIP, never an implied agreement',
  (f) => { f['package.json'] = '{ "name": "fixture", "version": "1.2.3" }\n' }, 0,
  'RS-license (manifest leg) SKIP')
expect('LB-M-placeholders an unfilled {{PLACEHOLDER}} token in prose reddens RS-placeholders',
  (f) => { f['README.md'] = f['README.md'].replace('Clone it.', 'Clone {{PROJECT_NAME}} first.') }, 1,
  '✗ RS-placeholders', 'unfilled template placeholder {{PROJECT_NAME}}')
expect('LB-M-placeholders-fence a placeholder inside a FENCED block still reddens (fences are where hand-copied templates hide them)',
  (f) => { f['README.md'] = f['README.md'].replace('Clone it.', 'Clone it.\n\n```bash\n{{INSTALL_COMMAND}}\n```') }, 1,
  '✗ RS-placeholders', '{{INSTALL_COMMAND}}')
expect('LB-M-placeholders-license an unfilled {{YEAR}} in the LICENSE file reddens RS-placeholders',
  (f) => { f['LICENSE'] = f['LICENSE'].replace('Copyright (c) 2026', 'Copyright (c) {{YEAR}}') }, 1,
  '✗ RS-placeholders', '{{YEAR}}')
expect('LB-S-placeholders-named NAMING a token in backticks stays green (a mention is not an unfilled scaffold)',
  (f) => { f['README.md'] = f['README.md'].replace('Clone it.', 'Clone it. The scaffolder fills every `{{PROJECT_NAME}}` token.') }, 0)
expect('LB-M-placeholders-fence-quoted a QUOTED token inside a fence still reddens (in code, quotes are syntax, not mentions)',
  (f) => { f['README.md'] = f['README.md'].replace('Clone it.', 'Clone it.\n\n```json\n{ "name": "{{PROJECT_NAME}}" }\n```') }, 1,
  '✗ RS-placeholders', '{{PROJECT_NAME}}')
expect('LB-M-shadow a .github/ copy of a governed stable doc reddens RS-shadow (GitHub would serve the ungoverned copy)',
  (f) => { f['.github/CONTRIBUTING.md'] = '# Contributing\n\nStale shadow.\n' }, 1,
  '✗ RS-shadow', '.github/CONTRIBUTING.md shadows CONTRIBUTING.md')
expect('LB-M-shadow-readme a docs/ copy of the README reddens RS-shadow (the root copy shadows it)',
  (f) => { f['docs/README.md'] = '# fixture\n\nOld copy.\n' }, 1,
  '✗ RS-shadow', 'README.md shadows docs/README.md')
expect('LB-S-shadow-elsewhere a README in an unrelated subdirectory is not a shadow (only the three GitHub-served locations count)',
  (f) => { f['acceptance/README.md'] = '# acceptance\n\nSuite docs.\n' }, 0)

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
// ── the six rules a mutation audit found with NO red-path case: each is deletable with the
// ── whole suite green until these exist, and each is the ONLY thing catching its own drift.
expect('LB-M-changelog-title a CHANGELOG titled something else ("# Release Notes") reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('# Changelog', '# Release Notes') }, 1,
  '✗ RS-changelog', 'must open with a top-level')
expect('LB-M-changelog-cite a CHANGELOG that never names the Keep a Changelog format reddens RS-changelog',
  (f) => { f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).', 'Format: some format.') }, 1,
  '✗ RS-changelog', 'must name the Keep a Changelog format')
expect('LB-M-conventions-decoy relocating CONVENTIONS while a rotten root CONVENTIONS.md remains reddens RS-conventions',
  (f) => {
    editConfig(f, (c) => { c.docs = { conventions: 'docs/CONVENTIONS.md' } })
    f['docs/CONVENTIONS.md'] = f['CONVENTIONS.md']          // the pristine configured copy
    f['CONVENTIONS.md'] = '# Conventions\n\n## 99. Rotten\n\nThe file contributors actually open.\n'
  }, 1,
  '✗ RS-conventions', 'one conventions doc only')
expect('LB-M-reflexivity-usage CONVENTIONS dropping a required README section ("Usage") reddens RS-reflexivity',
  (f) => { f['CONVENTIONS.md'] = f['CONVENTIONS.md'].replace('Install, Usage, Contributing,', 'Install, Contributing,') }, 1,
  '✗ RS-reflexivity', 'required README section "Usage"')
expect('LB-M-reflexivity-kac CONVENTIONS dropping the Keep a Changelog citation reddens RS-reflexivity',
  (f) => { f['CONVENTIONS.md'] = f['CONVENTIONS.md'].replace('CHANGELOG follows Keep a Changelog (keepachangelog.com):', 'CHANGELOG uses:') }, 1,
  '✗ RS-reflexivity', 'must cite the Keep a Changelog standard')
expect('LB-M-reflexivity-sr CONVENTIONS dropping the standard-readme citation reddens RS-reflexivity',
  (f) => { f['CONVENTIONS.md'] = f['CONVENTIONS.md'].replace('README follows standard-readme:', 'README has:') }, 1,
  '✗ RS-reflexivity', 'must cite the standard-readme standard')

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

// ── real-world markdown the lint must NOT false-fail (each was a confirmed review finding) ──
expect('LB-S-bom a UTF-8 BOM on the meta docs does not fail a compliant repo',
  (f) => { for (const d of ['README.md', 'CHANGELOG.md', 'CONVENTIONS.md', 'SECURITY.md']) f[d] = '﻿' + f[d] }, 0)
expect('LB-S-tilde-fence a CommonMark ~~~ fence hides its contents from the prose checks',
  (f) => { f['README.md'] = f['README.md'].replace('This repo has 3 widget', '~~~text\nWIDGET\n======\nRun simply with --help\n~~~\n\nThis repo has 3 widget') }, 0)
expect('LB-S-html-banner the centered `<p align="center">` banner idiom does not hide the tagline',
  (f) => { f['README.md'] = f['README.md'].replace('**A test fixture repo', '<p align="center">\n  <img src="logo.png" alt="fixture">\n</p>\n\n**A test fixture repo') }, 0)
expect('LB-S-html-comment an "=" rule inside an HTML comment is not a setext heading',
  (f) => { f['README.md'] = f['README.md'].replace('## Contributing', '<!--\nmaintainer note\n==============\nkeep in sync\n-->\n\n## Contributing') }, 0)
expect('LB-S-manifest-padded a column-aligned manifest table reconciles exactly like a compact one',
  (f) => { f['MANIFEST.md'] = f['MANIFEST.md'].replace('| `a` | UNCHANGED | x |', '| `a` | UNCHANGED | x |').replace(/\| `b` \| NEW \| x \|/, '| `b` | NEW       | x |').replace(/\| `c` \| NEW \| x \|/, '| `c` | NEW       | x |') }, 0)
expect('LB-M-manifest-padded-drift a padded table with a WRONG Totals line still reddens (the fix did not blind the check)',
  (f) => { f['MANIFEST.md'] = f['MANIFEST.md'].replace(/\| `b` \| NEW \| x \|/, '| `b` | NEW       | x |').replace('**1 UNCHANGED · 2 NEW · 3 total.**', '**1 UNCHANGED · 5 NEW · 6 total.**') }, 1,
  '✗ RS-manifest', 'the table has 2')
expect('LB-M-changelog-prerelease-chain an out-of-order rc chain (rc.9 above rc.1) reddens RS-changelog (semver §11)',
  (f) => {
    f['CHANGELOG.md'] = f['CHANGELOG.md'].replace('## [1.2.3] — 2026-01-01', '## [1.2.3-rc.1] - 2025-11-01\n\n### Added\n\n- first rc\n\n## [1.2.3-rc.9] - 2025-12-01\n\n### Added\n\n- ninth rc\n\n## [1.2.3] — 2026-01-01')
  }, 1,
  '✗ RS-changelog', 'must descend')

// ───────────────────────────────────────────────────────── config-error class (exit 2)
expect('LB-C-docs-type a non-string docs.changelog is a config error, not a crash',
  (f) => editConfig(f, (c) => { c.docs = { changelog: 5 } }), 2,
  '"docs.changelog" must be a string path', 'doc checks not run')
expect('LB-C-badglob a non-string counts glob is a config error (exit 2), not a doc failure',
  (f) => editConfig(f, (c) => { c.counts.widgets.glob = 7 }), 2,
  '"counts.widgets.glob" must be a string pattern')
expect('LB-C-badlineregex an uncompilable counts lineRegex is a config error (exit 2), not a doc failure',
  (f) => editConfig(f, (c) => { c.counts.rows.lineRegex = '^row:[' }), 2,
  'does not compile')
expect('LB-C-badrequire an uncompilable readme.requireSections entry is a config error (exit 2)',
  (f) => editConfig(f, (c) => { c.readme.requireSections = ['caveat['] }), 2,
  'does not compile')
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
