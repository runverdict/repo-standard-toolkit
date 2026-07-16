#!/usr/bin/env node
/*
 * test-payload-sync.mjs — the dogfood ⟺ payload byte-identity lock.
 *
 * WHY: this repo lives under the exact standard it installs everywhere else. The canonical
 * generic lint is payload/acceptance/test-repo-standard.mjs (what the scaffolder copies into
 * target repos); this repo's own acceptance/test-repo-standard.mjs is an installed copy. If the
 * two ever diverge — a fix applied to one side only, a sneaky dogfood-only exemption — we would
 * be shipping something other than what we live under. Same for the CI workflow: the gate this
 * repo runs is the gate the payload installs.
 *
 *   PS1  acceptance/test-repo-standard.mjs is byte-identical to the payload copy.
 *   PS2  .github/workflows/test.yml is byte-identical to payload/workflows/repo-standard.yml.
 *   PS3  the payload lint declares no imports beyond node: built-ins (what we install into a
 *        target repo can never grow a dependency without this reddening).
 *
 * Dependency-free: `node acceptance/test-payload-sync.mjs`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

let pass = 0, fail = 0
const check = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`) } catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`) } }

console.log('payload-sync standing test')

check('PS1 the installed lint is byte-identical to the payload lint (dogfood == shipped)', () => {
  assert.ok(read('acceptance/test-repo-standard.mjs') === read('payload/acceptance/test-repo-standard.mjs'),
    'acceptance/test-repo-standard.mjs differs from payload/acceptance/test-repo-standard.mjs — edit the payload, then re-copy: cp payload/acceptance/test-repo-standard.mjs acceptance/')
})

check('PS2 the dogfood CI workflow is byte-identical to the payload workflow', () => {
  assert.ok(read('.github/workflows/test.yml') === read('payload/workflows/repo-standard.yml'),
    '.github/workflows/test.yml differs from payload/workflows/repo-standard.yml — edit the payload, then re-copy: cp payload/workflows/repo-standard.yml .github/workflows/test.yml')
})

check('PS3 the payload lint imports only node: built-ins (a target repo can never inherit a dependency)', () => {
  const src = read('payload/acceptance/test-repo-standard.mjs')
  for (const m of src.matchAll(/\bfrom\s+['"]([^'"\n]+)['"]/g)) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1
    if (/^\s*(\/\/|\*|\/\*)/.test(src.slice(lineStart, m.index))) continue // prose in comments
    assert.ok(m[1].startsWith('node:'), `payload lint imports "${m[1]}" — only node: built-ins are allowed in what we install`)
  }
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
