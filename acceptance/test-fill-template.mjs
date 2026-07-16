#!/usr/bin/env node
/*
 * test-fill-template.mjs — standing acceptance guards for harness/fill-template.mjs.
 *
 * WHY: the fill engine is the scaffolder's mechanical half — if it ever fills partially, drops a
 * typo silently, or clobbers an existing file, every scaffolded repo ships broken.
 *
 * Guards:
 *   FT1 happy path — two placeholders fill to --out byte-exactly; engine reports the filled count.
 *   FT2 unfilled placeholder — a missing --set is exit 2, names the KEY, and --out is not created.
 *   FT3 unused --set key — an extra key is exit 2 and the error names it.
 *   FT4 no-clobber — an existing --out is refused unchanged without --force; --force overwrites.
 *   FT5 duplicate --set — the same KEY given twice is exit 2.
 *   FT6 --stdout — emits exactly the filled bytes (no log line), byte-identical across runs.
 *   FT7 argv refusals — malformed --set, unknown flag, no --template, --out+--stdout,
 *       nonexistent template: each exit 2.
 *   FT8 payload placeholder audit — every {{...}} in payload/templates/ is a well-formed
 *       {{KEY}} with KEY in [A-Z0-9_]+ (no malformed placeholder can ship).
 *
 * Dependency-free: node acceptance/test-fill-template.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENGINE = join(ROOT, 'harness', 'fill-template.mjs')

let pass = 0, fail = 0
const check = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`) } catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`) } }

// Run the engine expecting exit 0; returns its stdout.
const run = (args) => execFileSync('node', [ENGINE, ...args], { encoding: 'utf8' })

// Run the engine expecting a refusal; returns { status, message } where message is
// stderr + stdout combined (the engine reports on stderr — verified empirically — but
// asserting on both keeps the guard honest if that ever shifts). stdio is fully piped
// so the expected refusals do not leak into this test's own output.
const runFail = (args) => {
  try { execFileSync('node', [ENGINE, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) {
    return { status: e.status, message: `${e.stderr || ''}${e.stdout || ''}` }
  }
  throw new Error(`expected a nonzero exit, got exit 0 for: ${args.join(' ')}`)
}

const tmp = mkdtempSync(join(tmpdir(), 'fill-template-'))
try {
  const TPL = join(tmp, 'greeting.md')
  writeFileSync(TPL, 'Hello {{NAME}}, welcome to {{PLACE}}.\n')

  check('FT1 happy path: two placeholders fill to --out byte-exactly, count printed', () => {
    const out = join(tmp, 'ft1', 'greeting-filled.md')
    const log = run(['--template', TPL, '--set', 'NAME=Ada', '--set', 'PLACE=the machine room', '--out', out])
    const expected = Buffer.from('Hello Ada, welcome to the machine room.\n', 'utf8')
    assert.ok(readFileSync(out).equals(expected), 'output does not byte-equal the expected fill')
    assert.match(log, /2 placeholders filled/)
  })

  check('FT2 unfilled placeholder: exit 2, names the missing KEY, --out not created', () => {
    const out = join(tmp, 'ft2', 'never-written.md')
    const r = runFail(['--template', TPL, '--set', 'NAME=Ada', '--out', out])
    assert.equal(r.status, 2)
    assert.match(r.message, /unfilled placeholder/)
    assert.match(r.message, /PLACE/)
    assert.ok(!existsSync(out), `--out was created on a refused run: ${out}`)
  })

  check('FT3 unused --set key: exit 2, names the stray key', () => {
    const out = join(tmp, 'ft3', 'never-written.md')
    const r = runFail(['--template', TPL, '--set', 'NAME=Ada', '--set', 'PLACE=x', '--set', 'TYPO_KEY=y', '--out', out])
    assert.equal(r.status, 2)
    assert.match(r.message, /TYPO_KEY/)
    assert.ok(!existsSync(out), `--out was created on a refused run: ${out}`)
  })

  check('FT4 no-clobber: existing --out refused without --force, content unchanged', () => {
    const out = join(tmp, 'ft4-refuse.md')
    run(['--template', TPL, '--set', 'NAME=first', '--set', 'PLACE=one', '--out', out])
    const before = readFileSync(out, 'utf8')
    const r = runFail(['--template', TPL, '--set', 'NAME=second', '--set', 'PLACE=two', '--out', out])
    assert.equal(r.status, 2)
    assert.match(r.message, /refusing to overwrite/)
    assert.equal(readFileSync(out, 'utf8'), before, 'refused run mutated the existing --out')
  })

  check('FT4 no-clobber: --force overwrites the existing --out', () => {
    const out = join(tmp, 'ft4-force.md')
    run(['--template', TPL, '--set', 'NAME=first', '--set', 'PLACE=one', '--out', out])
    run(['--template', TPL, '--set', 'NAME=second', '--set', 'PLACE=two', '--out', out, '--force'])
    assert.equal(readFileSync(out, 'utf8'), 'Hello second, welcome to two.\n')
  })

  check('FT5 duplicate --set for the same KEY: exit 2', () => {
    const r = runFail(['--template', TPL, '--set', 'NAME=a', '--set', 'NAME=b', '--set', 'PLACE=x', '--stdout'])
    assert.equal(r.status, 2)
    assert.match(r.message, /NAME/)
    assert.match(r.message, /twice/)
  })

  check('FT6 --stdout: exactly the filled bytes, no log line, deterministic', () => {
    const args = ['--template', TPL, '--set', 'NAME=Ada', '--set', 'PLACE=Zurich', '--stdout']
    const first = run(args)
    const second = run(args)
    assert.equal(first, 'Hello Ada, welcome to Zurich.\n')
    assert.equal(first, second, 'two identical runs produced different bytes')
  })

  check("FT7 malformed --set (no '='): exit 2", () => {
    const r = runFail(['--template', TPL, '--set', 'NAMEAda', '--stdout'])
    assert.equal(r.status, 2)
    assert.match(r.message, /KEY=VALUE/)
  })

  check('FT7 unknown flag: exit 2', () => {
    const r = runFail(['--template', TPL, '--set', 'NAME=a', '--set', 'PLACE=b', '--stdout', '--bogus'])
    assert.equal(r.status, 2)
    assert.match(r.message, /unknown argument/)
  })

  check('FT7 missing --template: exit 2', () => {
    const r = runFail(['--set', 'NAME=a', '--stdout'])
    assert.equal(r.status, 2)
    assert.match(r.message, /--template is required/)
  })

  check('FT7 --out and --stdout together: exit 2', () => {
    const out = join(tmp, 'ft7', 'never-written.md')
    const r = runFail(['--template', TPL, '--set', 'NAME=a', '--set', 'PLACE=b', '--out', out, '--stdout'])
    assert.equal(r.status, 2)
    assert.match(r.message, /mutually exclusive/)
    assert.ok(!existsSync(out), `--out was created on a refused run: ${out}`)
  })

  check('FT7 nonexistent template path: exit 2', () => {
    const r = runFail(['--template', join(tmp, 'no-such-template.md'), '--set', 'NAME=a', '--stdout'])
    assert.equal(r.status, 2)
    assert.match(r.message, /template not found/)
  })

  check('FT8 payload placeholder audit: every {{...}} in payload/templates/ is {{[A-Z0-9_]+}}', () => {
    const dir = join(ROOT, 'payload', 'templates')
    // hand-rolled walk: `readdirSync(…, {recursive:true})` needs Node 18.17+ and
    // `dirent.parentPath` needs 18.20+, but CONTRIBUTING promises the suite runs on Node 18+.
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])
    const files = walk(dir)
    assert.ok(files.length > 0, `no files found under ${dir}`)
    const bad = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/\{\{[^}]*\}\}/g)) {
        if (!/^\{\{[A-Z0-9_]+\}\}$/.test(m[0])) bad.push(`${file}: ${JSON.stringify(m[0])}`)
      }
    }
    assert.deepEqual(bad, [], `malformed placeholder(s):\n    ${bad.join('\n    ')}`)
  })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
