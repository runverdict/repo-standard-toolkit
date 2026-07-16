#!/usr/bin/env node
/*
 * test-templates-lint-green.mjs — the templates are proven against the lint they ship with.
 *
 * WHY: the scaffolder's promise is that a freshly scaffolded repo passes the freshly installed
 * gate. If a payload template drifted out of the payload lint's standard (a heading renamed, a
 * banned word slipped into template prose, License no longer last), every future scaffold would
 * be born red. This test performs the scaffold MECHANICALLY, exactly as the skill does: fill
 * every payload/templates/* file through the real harness/fill-template.mjs engine with sample
 * values, resolve the TODO(scaffold) markers the way the agent must (replace with real prose),
 * install the payload lint + the payload default config verbatim, and run the gate.
 *
 * Guards:
 *   TG1  every template fills through the real engine (placeholder sets are total and typo-free).
 *   TG2  the scaffolded repo passes the shipped lint (exit 0) under the shipped default config.
 *   TG3  the run is honest about what it skipped (manifest / counts / lockstep print SKIP lines).
 *   TG4  an UNRESOLVED TODO(scaffold) in the scaffold is caught by the shipped lint (exit 1) —
 *        a half-finished scaffold cannot pass CI silently.
 *   TG5  both license templates fill (Apache-2.0 verbatim, MIT with year + holder).
 *
 * Dependency-free: `node acceptance/test-templates-lint-green.mjs`.
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FILL = join(ROOT, 'harness', 'fill-template.mjs')
const TPL = join(ROOT, 'payload', 'templates')

let pass = 0, fail = 0
const check = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`) } catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`) } }

// the sample values a scaffold session would derive/ask for — one flat map; fill-template
// rejects unused keys, so each template gets only the subset it declares.
const VALUES = {
  PROJECT_NAME: 'acme-demo',
  TAGLINE: 'A demo repo scaffolded by the repo standard.',
  INSTALL_COMMAND: 'git clone https://github.com/acme/acme-demo && cd acme-demo',
  USAGE_COMMAND: 'node bin/acme-demo.mjs --help',
  LICENSE_ID: 'Apache-2.0',
  LICENSE_HOLDER: 'Acme Maintainers',
  YEAR: '2026',
  DEFAULT_BRANCH: 'main',
  SECURITY_CONTACT: 'security@acme.example',
  COC_CONTACT: 'conduct@acme.example',
  REPO_SLUG: 'acme/acme-demo',
  REPO_URL: 'https://github.com/acme/acme-demo',
  FIRST_CHANGELOG_ENTRY: 'Repo hygiene standard scaffolded (README, CHANGELOG, CONVENTIONS, meta files, committed lint + CI gate).',
}

const fill = (template, out) => {
  const src = readFileSync(join(TPL, template), 'utf8')
  const keys = [...new Set([...src.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]))]
  const args = ['--template', join(TPL, template), '--out', out]
  for (const k of keys) {
    assert.ok(k in VALUES, `template ${template} uses a placeholder {{${k}}} this test has no sample value for — add it to VALUES`)
    args.push('--set', `${k}=${VALUES[k]}`)
  }
  execFileSync('node', [FILL, ...args], { encoding: 'utf8' })
}

// the agent's half, done mechanically: every TODO(scaffold) HTML comment becomes real prose.
const resolveTodos = (path) => {
  const text = readFileSync(path, 'utf8')
  writeFileSync(path, text.replace(/<!--\s*TODO\(scaffold\):[\s\S]*?-->/g, 'Written from the real repo by the scaffold session: what this section claims is verified against the code, and limits are stated plainly.'))
}

const runLint = (dir) => {
  try { return { code: 0, out: execFileSync('node', [join(dir, 'acceptance', 'test-repo-standard.mjs')], { encoding: 'utf8' }) } }
  catch (e) { return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` } }
}

console.log('templates-lint-green standing test (mechanical scaffold → shipped gate)')

const tmp = mkdtempSync(join(tmpdir(), 'rs-templates-'))
try {
  const scaffolded = []
  check('TG1 every doc template fills through the real fill-template engine', () => {
    for (const [template, dest] of [
      ['README.md', 'README.md'],
      ['CHANGELOG.md', 'CHANGELOG.md'],
      ['CONVENTIONS.md', 'CONVENTIONS.md'],
      ['CONTRIBUTING.md', 'CONTRIBUTING.md'],
      ['CODE_OF_CONDUCT.md', 'CODE_OF_CONDUCT.md'],
      ['SECURITY.md', 'SECURITY.md'],
      ['LICENSE-Apache-2.0.txt', 'LICENSE'],
    ]) {
      fill(template, join(tmp, dest))
      scaffolded.push(dest)
    }
    for (const f of scaffolded) assert.ok(!readFileSync(join(tmp, f), 'utf8').includes('{{'), `${f} still carries a placeholder`)
  })

  // TG4 first — BEFORE resolving TODOs, the shipped lint must refuse the half-finished scaffold.
  mkdirSync(join(tmp, 'acceptance'), { recursive: true })
  copyFileSync(join(ROOT, 'payload', 'acceptance', 'test-repo-standard.mjs'), join(tmp, 'acceptance', 'test-repo-standard.mjs'))
  copyFileSync(join(ROOT, 'payload', 'repo-standard.json'), join(tmp, '.repo-standard.json'))
  check('TG4 an unresolved TODO(scaffold) is caught by the shipped lint — a half scaffold cannot pass', () => {
    const r = runLint(tmp)
    assert.equal(r.code, 1, `expected exit 1 on the unresolved scaffold, got ${r.code}\n${r.out}`)
    assert.ok(r.out.includes('RS-todos') && r.out.includes('TODO(scaffold)'), `RS-todos should name the marker\n${r.out}`)
  })

  check('TG2 after the agent half (TODOs resolved), the scaffolded repo passes the shipped gate under the shipped default config', () => {
    for (const f of scaffolded) if (f.endsWith('.md')) resolveTodos(join(tmp, f))
    const r = runLint(tmp)
    assert.equal(r.code, 0, `the scaffolded repo must pass the shipped lint\n--- lint output ---\n${r.out}`)
  })

  check('TG3 the green run names its dormant surfaces (manifest, counts, lockstep) as SKIPs, never silently', () => {
    const r = runLint(tmp)
    assert.ok(r.out.includes('RS-manifest SKIP'), `manifest skip must be printed\n${r.out}`)
    assert.ok(r.out.includes('RS-counts SKIP'), `counts skip must be printed\n${r.out}`)
    // must be the SKIP line specifically: a bare 'RS-lockstep' needle is satisfied by a '✓'
    // PASS too, which is exactly the failure this check exists to catch — a dormant check
    // counted as a pass inflates the green total and hides that it never ran. This is the only
    // coverage of the no-version-manifest skip path (the lint-behavior fixture ships a
    // package.json, so lockstep is always ACTIVE there).
    assert.ok(r.out.includes('RS-lockstep SKIP'), `lockstep must print a SKIP line, not merely appear\n${r.out}`)
    assert.match(r.out, /\d+ passed, 0 failed, \d+ skipped/, `the summary must count the skips it printed\n${r.out}`)
  })

  check('TG5 both license templates carry the copyright line and fill it with the real year + holder', () => {
    fill('LICENSE-MIT.txt', join(tmp, 'LICENSE-MIT-sample'))
    const mit = readFileSync(join(tmp, 'LICENSE-MIT-sample'), 'utf8')
    assert.ok(mit.includes('Copyright (c) 2026 Acme Maintainers'), 'MIT fill carries year + holder')
    // the Apache template takes the same two placeholders — a hardcoded copyright line here
    // would stamp someone else's attribution into every repo this ever scaffolds.
    const apache = readFileSync(join(tmp, 'LICENSE'), 'utf8')
    assert.ok(apache.includes('Copyright 2026 Acme Maintainers'), 'Apache fill carries year + holder')
    assert.ok(!apache.includes('{{'), 'Apache LICENSE is fully filled')
    for (const t of ['LICENSE-Apache-2.0.txt', 'LICENSE-MIT.txt']) {
      const src = readFileSync(join(TPL, t), 'utf8')
      assert.ok(/\{\{YEAR\}\}/.test(src) && /\{\{LICENSE_HOLDER\}\}/.test(src), `${t} must take YEAR + LICENSE_HOLDER rather than hardcoding an attribution`)
    }
  })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
