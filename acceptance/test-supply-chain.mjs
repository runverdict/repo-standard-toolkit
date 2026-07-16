#!/usr/bin/env node
/*
 * test-supply-chain.mjs — standing supply-chain + CI least-privilege guard for THIS plugin repo.
 *
 * WHY: a plugin that installs hygiene gates into other repos must hold its own trust floor —
 * zero npm surface and read-only CI tokens — or the posture rots the first time a dep sneaks in.
 *
 * Guards:
 *   SC1 no package.json / package-lock.json anywhere in the tree (zero runtime npm dependencies).
 *   SC2 every .mjs under harness/, acceptance/, and payload/ imports only node builtins or relative paths.
 *   SC3 every workflow under .github/workflows/ declares a top-level least-privilege token:
 *       a column-0 `permissions:` block granting `contents: read`, no write scope, no write-all.
 *   SC4 the payload CI workflow (payload/workflows/repo-standard.yml) passes the same SC3
 *       assertions — what we install into target repos is least-privilege too.
 *
 * Dependency-free: node acceptance/test-supply-chain.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { builtinModules } from 'node:module'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

let pass = 0, fail = 0
const check = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`) } catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`) }
}

console.log('supply-chain standing test (zero npm surface + least-privilege CI tokens)')

check('SC1 no package.json / package-lock.json anywhere in the tree', () => {
  let files
  if (existsSync(join(ROOT, '.git'))) {
    // --cached --others --exclude-standard: tracked PLUS untracked-unignored, so the guard
    // covers work-in-progress files before their first commit (a bare `git ls-files` lists
    // only what the index already knows about — near-vacuous on a fresh checkout).
    files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  } else {
    // Not a git checkout (e.g. an extracted archive) — walk the tree instead.
    const walk = (rel) => readdirSync(join(ROOT, rel), { withFileTypes: true }).flatMap((e) => {
      if (e.name === '.git' || e.name === 'node_modules') return []
      const child = rel ? `${rel}/${e.name}` : e.name
      return e.isDirectory() ? walk(child) : [child]
    })
    files = walk('')
  }
  assert.ok(files.length >= 25,
    `expected a full repo file listing, got ${files.length} — refusing a vacuous pass`)
  const offenders = files.filter((f) => /(^|\/)package(-lock)?\.json$/.test(f))
  assert.deepEqual(offenders, [],
    `zero-runtime-npm-dependency posture violated — remove: ${offenders.join(', ')}`)
})

check('SC2 every harness/ + acceptance/ + payload/ .mjs import is a node builtin or a relative path', () => {
  const mjsUnder = (dir, recursive = false) => {
    if (!existsSync(join(ROOT, dir))) return []
    return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const child = `${dir}/${e.name}`
      if (e.isDirectory()) return recursive && e.name !== 'node_modules' ? mjsUnder(child, true) : []
      return e.isFile() && e.name.endsWith('.mjs') ? [child] : []
    })
  }
  const files = [...mjsUnder('harness'), ...mjsUnder('acceptance'), ...mjsUnder('payload', true)]
  // Static `… from '<spec>'` (matches the closing line of a multi-line import too),
  // bare `import '<spec>'`, dynamic `import('<spec>')`, and `require('<spec>')`.
  const specRes = [
    /\bfrom\s+['"]([^'"\n]+)['"]/g,
    /(?:^|[;\n])\s*import\s+['"]([^'"\n]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"\n]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"\n]+)['"]/g,
  ]
  const offenders = []
  let specs = 0
  for (const rel of files) {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    for (const re of specRes) {
      for (const m of src.matchAll(re)) {
        // Prose in comments can echo the pattern (e.g. `// … from "CWE-###: …"`).
        // Skip matches on comment lines; real import/export/require lines never are.
        const lineStart = src.lastIndexOf('\n', m.index) + 1
        if (/^\s*(\/\/|\*|\/\*)/.test(src.slice(lineStart, m.index))) continue
        specs++
        const spec = m[1]
        const ok = spec.startsWith('./') || spec.startsWith('../')
          || spec.startsWith('node:') || builtinModules.includes(spec)
        if (!ok) offenders.push(`${rel}: '${spec}'`)
      }
    }
  }
  assert.ok(files.length >= 5 && specs >= 10,
    `expected the full stdlib-only surface (got ${files.length} files / ${specs} import specifiers) — refusing a vacuous pass`)
  assert.deepEqual(offenders, [],
    `third-party import in the stdlib-only tree:\n    ${offenders.join('\n    ')}`)
})

// Shared least-privilege assertions, applied to this repo's CI (SC3) and the shipped payload CI (SC4).
const assertLeastPrivilege = (label, yml) => {
  assert.match(yml, /^permissions:\s*$/m,
    `${label}: must declare a top-level \`permissions:\` block at column 0 (least privilege over the default scope)`)
  assert.match(yml, /^\s+contents:\s*read\s*$/m,
    `${label}: the permissions block must grant \`contents: read\``)
  // Reject ANY write grant: `contents: write`, `id-token: write`, `packages: write`, …
  const writes = yml.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /:\s*write\b/i.test(l))
  assert.deepEqual(writes, [],
    `${label}: no permission may be granted write scope — found:\n    ${writes.map(([n, l]) => `L${n}: ${l.trim()}`).join('\n    ')}`)
  assert.doesNotMatch(yml, /write-all/i,
    `${label}: \`permissions: write-all\` (or any write-all) is forbidden`)
}

check('SC3 every .github/workflows/ workflow declares a least-privilege token (contents: read, no write)', () => {
  const wfDir = join(ROOT, '.github', 'workflows')
  const workflows = readdirSync(wfDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  assert.ok(workflows.length >= 1,
    'expected at least one workflow under .github/workflows/ — refusing a vacuous pass')
  for (const wf of workflows) {
    assertLeastPrivilege(`.github/workflows/${wf}`, readFileSync(join(wfDir, wf), 'utf8'))
  }
})

check('SC4 every payload CI workflow we install into target repos is least-privilege too', () => {
  const dir = join(ROOT, 'payload', 'workflows')
  const workflows = readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  assert.ok(workflows.length >= 2, `expected the full + scoped payload workflows under payload/workflows/ (found ${workflows.length}) — refusing a vacuous pass`)
  for (const wf of workflows) {
    assertLeastPrivilege(`payload/workflows/${wf}`, readFileSync(join(dir, wf), 'utf8'))
  }
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
