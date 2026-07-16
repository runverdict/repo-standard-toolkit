#!/usr/bin/env node
/*
 * test-sense-state.mjs — standing acceptance test for harness/sense-state.mjs, the read-only
 * inventory engine whose classification and per-artifact plan the scaffold skill trusts blindly.
 *
 * WHY: a wrong sense silently scaffolds over a governed repo or skips a greenfield one — the
 * one mistake the plugin promises never to make.
 *
 * Guards:
 *   SS1 empty dir → 'greenfield'; every doc scaffold, lint/config/CI all install
 *   SS2 README.md alone → 'partial'; README audit, CHANGELOG scaffold
 *   SS3 governed fixture (all docs + payload-identical lint + config + CI gate) → 'governed',
 *       lint keep, matchesPayload true (SKIPPED with a note if the payload lint does not exist)
 *   SS4 drifted installed lint → upgrade, matchesPayload false, classification still 'governed'
 *       (drift is an upgrade, not a de-governing; SKIPPED alongside SS3)
 *   SS5 --json parses; two runs are byte-identical; the engine writes nothing into the fixture
 *   SS6 derivation from package.json with no git — projectName/tagline/licenseId derived,
 *       git.isRepo false, hasH1:false reported for a doc without an H1
 *   SS7 bad invocation (file as target, missing dir, unknown flag) → exit 2 with a message
 *
 * Dependency-free: node acceptance/test-sense-state.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync, copyFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENGINE = join(ROOT, 'harness', 'sense-state.mjs')
const PAYLOAD_LINT = join(ROOT, 'payload', 'acceptance', 'test-repo-standard.mjs')
const DOCS = ['README.md', 'CHANGELOG.md', 'CONVENTIONS.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md']

let pass = 0, fail = 0
const check = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`) } catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`) }
}

const senseRaw = (dir) => execFileSync('node', [ENGINE, '--target', dir, '--json'], { encoding: 'utf8' })
const sense = (dir) => JSON.parse(senseRaw(dir))
const planAction = (report, artifact) => report.plan.find((p) => p.artifact === artifact)?.action
const listFiles = (dir) => {
  const out = []
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(join(d, e.name), r)
      else out.push(r)
    }
  }
  walk(dir, '')
  return out.sort()
}
const expectExit2 = (argv, needle) => {
  let err = null
  try { execFileSync('node', [ENGINE, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { err = e }
  assert.ok(err, `expected exit 2 for [${argv.join(' ')}], but the engine exited 0`)
  assert.equal(err.status, 2, `expected exit 2 for [${argv.join(' ')}], got ${err.status}`)
  const out = `${err.stderr || ''}${err.stdout || ''}`
  assert.ok(out.includes(needle), `expected "${needle}" in engine output, got: ${out.trim()}`)
}
// Governed fixture: all six docs (with H1s) + LICENSE, the installed lint byte-copied from the
// payload, an empty-but-valid config, and a workflow that runs the acceptance suite.
const buildGoverned = (dir) => {
  mkdirSync(join(dir, 'acceptance'), { recursive: true })
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true })
  for (const doc of DOCS) writeFileSync(join(dir, doc), `# ${doc.replace(/\.md$/, '')}\n\nBody text.\n`)
  writeFileSync(join(dir, 'LICENSE'), 'MIT License\n\nCopyright (c) 2026 Example\n')
  copyFileSync(PAYLOAD_LINT, join(dir, 'acceptance', 'test-repo-standard.mjs'))
  writeFileSync(join(dir, '.repo-standard.json'), '{}')
  writeFileSync(join(dir, '.github', 'workflows', 'x.yml'), 'name: gate\njobs:\n  test:\n    steps:\n      - run: for t in acceptance/test-*.mjs; do node "$t" || exit 1; done\n')
}

console.log('test-sense-state — harness/sense-state.mjs')
const tmp = mkdtempSync(join(tmpdir(), 'sense-state-test-'))
try {
  // ---- SS1: empty dir → greenfield, everything scaffold/install ----
  const empty = join(tmp, 'empty')
  mkdirSync(empty)
  check('SS1: empty dir classifies greenfield', () => {
    assert.equal(sense(empty).classification, 'greenfield')
  })
  check('SS1: plan scaffolds every doc and installs lint, config, CI', () => {
    const r = sense(empty)
    for (const doc of [...DOCS, 'LICENSE']) assert.equal(planAction(r, doc), 'scaffold', `${doc} should be scaffold`)
    assert.equal(planAction(r, 'acceptance/test-repo-standard.mjs'), 'install')
    assert.equal(planAction(r, '.repo-standard.json'), 'install')
    assert.equal(planAction(r, '.github/workflows (acceptance gate)'), 'install')
  })

  // ---- SS2: README.md alone → partial; audit what exists, scaffold the gaps ----
  const readmeOnly = join(tmp, 'readme-only')
  mkdirSync(readmeOnly)
  writeFileSync(join(readmeOnly, 'README.md'), '# My Project\n\nA thing.\n')
  check('SS2: README.md alone classifies partial', () => {
    assert.equal(sense(readmeOnly).classification, 'partial')
  })
  check('SS2: existing README is audit, missing CHANGELOG is scaffold', () => {
    const r = sense(readmeOnly)
    assert.equal(planAction(r, 'README.md'), 'audit')
    assert.equal(planAction(r, 'CHANGELOG.md'), 'scaffold')
  })

  // ---- SS3/SS4: governed and drifted-lint fixtures (need the payload lint to compare against) ----
  if (!existsSync(PAYLOAD_LINT)) {
    console.log('  - SS3/SS4 SKIPPED: payload/acceptance/test-repo-standard.mjs does not exist yet; nothing to byte-compare against')
  } else {
    const governed = join(tmp, 'governed')
    mkdirSync(governed)
    buildGoverned(governed)
    check('SS3: fully governed fixture classifies governed', () => {
      assert.equal(sense(governed).classification, 'governed')
    })
    check('SS3: byte-identical installed lint is keep, matchesPayload true', () => {
      const r = sense(governed)
      assert.equal(r.enforcement.lint.matchesPayload, true)
      assert.equal(planAction(r, 'acceptance/test-repo-standard.mjs'), 'keep')
    })
    appendFileSync(join(governed, 'acceptance', 'test-repo-standard.mjs'), '\n')
    check('SS4: drifted installed lint is upgrade, matchesPayload false', () => {
      const r = sense(governed)
      assert.equal(r.enforcement.lint.matchesPayload, false)
      assert.equal(planAction(r, 'acceptance/test-repo-standard.mjs'), 'upgrade')
    })
    check('SS4: lint drift does not de-govern the classification', () => {
      assert.equal(sense(governed).classification, 'governed')
    })
  }

  // ---- SS5: --json is valid JSON, deterministic, and the engine is read-only ----
  check('SS5: --json output parses as JSON', () => {
    const r = JSON.parse(senseRaw(readmeOnly))
    assert.equal(typeof r.classification, 'string')
    assert.ok(Array.isArray(r.plan))
  })
  check('SS5: two runs on the same tree are byte-identical', () => {
    assert.equal(senseRaw(readmeOnly), senseRaw(readmeOnly))
  })
  check('SS5: a run creates no files in the fixture (read-only engine)', () => {
    // A fresh fixture the engine has never seen, so the pre-run snapshot cannot be contaminated.
    const untouched = join(tmp, 'untouched')
    mkdirSync(untouched)
    writeFileSync(join(untouched, 'README.md'), '# Untouched\n')
    const before = listFiles(untouched)
    senseRaw(untouched)
    execFileSync('node', [ENGINE, '--target', untouched], { encoding: 'utf8' }) // human format too
    assert.deepEqual(listFiles(untouched), before)
  })

  // ---- SS6: derivation from package.json, no git, hasH1 reporting ----
  const derive = join(tmp, 'derive')
  mkdirSync(derive)
  writeFileSync(join(derive, 'package.json'), JSON.stringify({ name: 'acme-widgets', description: 'Widgets for Acme', license: 'MIT' }))
  writeFileSync(join(derive, 'README.md'), 'no heading here, just prose\n')
  check('SS6: package.json signals derive name, tagline, license without git', () => {
    const r = sense(derive)
    assert.equal(r.derived.projectName, 'acme-widgets')
    assert.equal(r.derived.tagline, 'Widgets for Acme')
    assert.equal(r.derived.licenseId, 'MIT')
    assert.equal(r.signals.git.isRepo, false)
  })
  check('SS6: a doc without an H1 reports hasH1 false', () => {
    const r = sense(derive)
    assert.equal(r.artifacts['README.md'].exists, true)
    assert.equal(r.artifacts['README.md'].hasH1, false)
  })

  // ---- SS7: bad invocation exits 2 with a message ----
  const aFile = join(tmp, 'a-file.txt')
  writeFileSync(aFile, 'not a directory\n')
  check('SS7: --target pointing at a file exits 2', () => {
    expectExit2(['--target', aFile], 'target is not a directory')
  })
  check('SS7: --target pointing at a missing dir exits 2', () => {
    expectExit2(['--target', join(tmp, 'no-such-dir')], 'target is not a directory')
  })
  check('SS7: unknown flag exits 2', () => {
    expectExit2(['--bogus'], 'unknown argument')
  })

  // ---- SS8: derivation fallbacks + precise gate detection (the adversarial-pass hardenings) ----
  const fallbacks = join(tmp, 'fallbacks')
  mkdirSync(join(fallbacks, '.github', 'workflows'), { recursive: true })
  writeFileSync(join(fallbacks, 'LICENSE'), 'MIT License\n\nCopyright (c) 2019 Legacy Co\n\nPermission is hereby granted, free of charge...\n')
  writeFileSync(join(fallbacks, 'README.md'), '# legacy-tool\n\nLegacy tooling for the Fooberg pipeline.\n\n## Notes\n\nx\n')
  // a workflow that runs ONE unrelated acceptance test is NOT the gate
  writeFileSync(join(fallbacks, '.github', 'workflows', 'ci.yml'), 'name: ci\njobs:\n  t:\n    steps:\n      - run: node acceptance/test-always-green.mjs\n')
  check('SS8: licenseId derives from a recognizable LICENSE file when no manifest declares one', () => {
    assert.equal(sense(fallbacks).derived.licenseId, 'MIT')
  })
  check('SS8: tagline falls back to the first paragraph after the existing README H1', () => {
    assert.equal(sense(fallbacks).derived.tagline, 'Legacy tooling for the Fooberg pipeline.')
  })
  check('SS8: a workflow running one unrelated test is NOT the acceptance gate (plan installs one)', () => {
    const r = sense(fallbacks)
    assert.equal(r.enforcement.ci.runsAcceptance, false)
    assert.equal(planAction(r, '.github/workflows (acceptance gate)'), 'install')
  })
  check('SS8: an unrecognizable LICENSE file derives "unrecognized", never a guessed id', () => {
    const odd = join(tmp, 'odd-license')
    mkdirSync(odd)
    writeFileSync(join(odd, 'LICENSE'), 'You may use this for good, not evil.\n')
    assert.equal(sense(odd).derived.licenseId, 'unrecognized')
  })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
