#!/usr/bin/env node
/*
 * test-install-hook.mjs — the standing test for harness/install-hook.mjs and the pre-push hook.
 *
 * WHY: this engine writes into `.git/`, the one directory an operator never reviews in a diff,
 * to install a convenience that must never be mistaken for enforcement. So its REFUSALS are the
 * product: clobbering someone's husky setup, or writing a file git will never read and calling
 * it success, are exactly the surprises that make a tool untrustworthy. Each refusal is proven
 * here, and the hook's own behavior is proven by RUNNING it against real repos.
 *
 * Guards:
 *   IH1  install into a governed repo writes an executable .git/hooks/pre-push carrying the
 *        marker, and is idempotent (a second run is a no-op re-write, still exit 0).
 *   IH2  REFUSALS (each exit 2, nothing written): not a git repo · --target below the repo root
 *        · not governed (no lint) · an existing foreign pre-push hook · core.hooksPath set.
 *   IH3  --force replaces a foreign hook only when asked; --check writes nothing and reports.
 *   IH4  --uninstall removes OUR hook, refuses a foreign one, is a no-op when none exists.
 *   IH5  THE HOOK ITSELF, executed: green lint -> exit 0 (push proceeds); drifted docs -> exit 1
 *        (push blocked) naming the drift; broken config -> exit 1 naming the config; a repo whose
 *        lint was removed -> exit 0 (no-op, never a mystery block).
 *   IH6  the hook never runs anything but the repo-standard lint — a red sibling test in
 *        acceptance/ does NOT block the push (their tests are their business).
 *   IH7  the payload hook is honest: it documents --no-verify, removal, and that CI is the gate.
 *
 * Dependency-free: `node acceptance/test-install-hook.mjs`.
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, statSync, copyFileSync, chmodSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ENGINE = join(ROOT, 'harness', 'install-hook.mjs')
const PAYLOAD_HOOK = join(ROOT, 'payload', 'hooks', 'pre-push')
const PAYLOAD_LINT = join(ROOT, 'payload', 'acceptance', 'test-repo-standard.mjs')

let pass = 0, fail = 0
const check = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`) } catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`) } }

const run = (argv, cwd) => {
  try { return { code: 0, out: execFileSync('node', [ENGINE, ...argv], { encoding: 'utf8', cwd }) } }
  catch (e) { return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` } }
}
const expectRefusal = (argv, cwd, needle) => {
  const r = run(argv, cwd)
  assert.equal(r.code, 2, `expected exit 2 (refused), got ${r.code}\n${r.out}`)
  assert.ok(r.out.includes(needle), `refusal should explain "${needle}", got: ${r.out.trim()}`)
  return r
}

// a minimal governed repo: git init + the real payload lint + a config + the docs it checks
const gitRepo = (dir) => {
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  return dir
}
const governed = (dir, { lint = true } = {}) => {
  gitRepo(dir)
  if (lint) {
    mkdirSync(join(dir, 'acceptance'), { recursive: true })
    copyFileSync(PAYLOAD_LINT, join(dir, 'acceptance', 'test-repo-standard.mjs'))
  }
  writeFileSync(join(dir, '.repo-standard.json'), JSON.stringify({ version: 1 }, null, 2))
  writeFileSync(join(dir, 'README.md'), [
    '# fixture', '', '**A fixture repo.**', '',
    '## Install', '', 'Clone it.', '', '## Usage', '', 'Run it.', '',
    '## Caveats', '', 'Limits.', '', '## Contributing', '', 'PRs.', '', '## License', '', 'MIT.', '',
  ].join('\n'))
  writeFileSync(join(dir, 'CHANGELOG.md'), '# Changelog\n\n[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).\n\n## [Unreleased]\n\n### Added\n\n- x\n')
  writeFileSync(join(dir, 'CONVENTIONS.md'), [
    '# Conventions', '', '## 1. Meta docs', '',
    'CHANGELOG follows Keep a Changelog (keepachangelog.com): Added / Changed / Deprecated /',
    'Removed / Fixed / Security. README follows standard-readme: Install, Usage, Contributing,',
    'License last.', '',
  ].join('\n'))
  for (const f of ['SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md']) writeFileSync(join(dir, f), `# ${f}\n\nBody.\n`)
  return dir
}
// run the installed hook the way git does: execute it, from the repo root
const runHook = (dir) => {
  try { return { code: 0, out: execFileSync(join(dir, '.git', 'hooks', 'pre-push'), [], { encoding: 'utf8', cwd: dir }) } }
  catch (e) { return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` } }
}

console.log('install-hook standing test (the optional pre-push convenience)')
const tmp = mkdtempSync(join(tmpdir(), 'rs-hook-'))
try {
  // ───────────────────────────────────────────────────────────────── IH1 install
  check('IH1 install writes an executable, marker-carrying pre-push hook and is idempotent', () => {
    const d = governed(join(tmp, 'ih1'))
    const r = run(['--target', d], tmp)
    assert.equal(r.code, 0, `install should succeed\n${r.out}`)
    const hook = join(d, '.git', 'hooks', 'pre-push')
    assert.ok(existsSync(hook), 'the hook file exists')
    assert.equal(readFileSync(hook, 'utf8'), readFileSync(PAYLOAD_HOOK, 'utf8'), 'installed byte-identical to the payload')
    assert.ok(statSync(hook).mode & 0o111, 'the hook is executable — git will not run it otherwise')
    assert.ok(r.out.includes('not the gate'), 'the engine states it is not the gate')
    const again = run(['--target', d], tmp)
    assert.equal(again.code, 0, 'a second install is a no-op re-write, not a refusal')
  })

  // ─────────────────────────────────────────────────────────────── IH2 refusals
  check('IH2 refuses: not a git repo', () => {
    const d = join(tmp, 'ih2-nogit')
    mkdirSync(d)
    expectRefusal(['--target', d], tmp, 'not a git repository')
  })
  check('IH2 refuses: --target is below the repo root (never touch a parent repo\'s hooks)', () => {
    const d = governed(join(tmp, 'ih2-sub'))
    const sub = join(d, 'packages', 'inner')
    mkdirSync(sub, { recursive: true })
    const r = expectRefusal(['--target', sub], tmp, 'is not its root')
    assert.ok(r.out.includes(d), 'the refusal names the real repo root to re-run against')
  })
  check('IH2 refuses: the repo is not governed yet (no lint to run)', () => {
    const d = governed(join(tmp, 'ih2-ungov'), { lint: false })
    expectRefusal(['--target', d], tmp, 'not governed yet')
    assert.ok(!existsSync(join(d, '.git', 'hooks', 'pre-push')), 'nothing written on a refusal')
  })
  check('IH2 refuses: an existing foreign pre-push hook is never clobbered', () => {
    const d = governed(join(tmp, 'ih2-foreign'))
    const hook = join(d, '.git', 'hooks', 'pre-push')
    mkdirSync(join(d, '.git', 'hooks'), { recursive: true })
    writeFileSync(hook, '#!/bin/sh\necho "husky or someone else"\n')
    expectRefusal(['--target', d], tmp, 'refusing to clobber')
    assert.ok(readFileSync(hook, 'utf8').includes('husky'), 'the foreign hook is untouched')
  })
  check('IH2 refuses: core.hooksPath points elsewhere (installing would be a silent no-op)', () => {
    const d = governed(join(tmp, 'ih2-hookspath'))
    execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: d, stdio: 'ignore' })
    expectRefusal(['--target', d], tmp, 'core.hooksPath')
    assert.ok(!existsSync(join(d, '.git', 'hooks', 'pre-push')), 'nothing written where git would never look')
  })

  // ──────────────────────────────────────────────────────── IH3 --force / --check
  check('IH3 --force replaces a foreign hook only when asked; --check writes nothing', () => {
    const d = governed(join(tmp, 'ih3'))
    const hook = join(d, '.git', 'hooks', 'pre-push')
    mkdirSync(join(d, '.git', 'hooks'), { recursive: true })
    writeFileSync(hook, '#!/bin/sh\necho foreign\n')
    const c = run(['--target', d, '--check'], tmp)
    assert.equal(c.code, 1, '--check reports work to do with exit 1')
    assert.ok(c.out.includes('--force required'), '--check names the --force requirement')
    assert.ok(readFileSync(hook, 'utf8').includes('foreign'), '--check wrote nothing')
    const f = run(['--target', d, '--force'], tmp)
    assert.equal(f.code, 0, '--force installs over the foreign hook')
    assert.ok(readFileSync(hook, 'utf8').includes('repo-standard pre-push'), 'ours now')
    const clean = run(['--target', d, '--check'], tmp)
    assert.equal(clean.code, 0, '--check on a current install is exit 0 (nothing to do)')
  })

  // ─────────────────────────────────────────────────────────── IH4 --uninstall
  check('IH4 --uninstall removes ours, refuses a foreign hook, no-ops when absent', () => {
    const d = governed(join(tmp, 'ih4'))
    const none = run(['--target', d, '--uninstall'], tmp)
    assert.equal(none.code, 0, 'uninstalling nothing is fine')
    assert.ok(none.out.includes('nothing to remove'))
    run(['--target', d], tmp)
    const gone = run(['--target', d, '--uninstall'], tmp)
    assert.equal(gone.code, 0)
    assert.ok(!existsSync(join(d, '.git', 'hooks', 'pre-push')), 'ours is removed')
    const hook = join(d, '.git', 'hooks', 'pre-push')
    writeFileSync(hook, '#!/bin/sh\necho foreign\n')
    expectRefusal(['--target', d, '--uninstall'], tmp, "not written by this toolkit")
    assert.ok(existsSync(hook), 'a foreign hook survives an uninstall')
  })

  // ─────────────────────────────────────────────── IH5 the hook's real behavior
  check('IH5 the hook: green lint -> exit 0, so the push proceeds', () => {
    const d = governed(join(tmp, 'ih5-green'))
    run(['--target', d], tmp)
    const r = runHook(d)
    assert.equal(r.code, 0, `a compliant repo must not be blocked\n${r.out}`)
  })
  check('IH5 the hook: drifted docs -> exit 1, blocking the push and naming the drift', () => {
    const d = governed(join(tmp, 'ih5-drift'))
    run(['--target', d], tmp)
    // an ad-hoc CHANGELOG category — the classic drift
    writeFileSync(join(d, 'CHANGELOG.md'), '# Changelog\n\n[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).\n\n## [Unreleased]\n\n### Notes\n\n- ad hoc\n')
    const r = runHook(d)
    assert.equal(r.code, 1, 'drift must block the push')
    assert.ok(r.out.includes('RS-changelog'), 'the lint failure itself is shown')
    assert.ok(r.out.includes('--no-verify'), 'the escape hatch is offered')
    assert.ok(r.out.includes('CI'), 'it says CI is the real gate')
  })
  check('IH5 the hook: a broken config -> exit 1 pointing at the config, not the docs', () => {
    const d = governed(join(tmp, 'ih5-cfg'))
    run(['--target', d], tmp)
    writeFileSync(join(d, '.repo-standard.json'), '{ "version": 1, "bogusKey": true }')
    const r = runHook(d)
    assert.equal(r.code, 1, 'a broken config blocks the push')
    assert.ok(r.out.includes('config'), 'it names the config as the thing to fix')
  })
  check('IH5 the hook: no lint present -> exit 0 (a no-op, never a mystery block)', () => {
    const d = governed(join(tmp, 'ih5-nolint'))
    run(['--target', d], tmp)
    rmSync(join(d, 'acceptance', 'test-repo-standard.mjs'))
    const r = runHook(d)
    assert.equal(r.code, 0, 'an ungoverned repo is not blocked by a leftover hook')
  })

  // ──────────────────────────────────── IH6 scope: only OUR lint, not their tests
  check('IH6 the hook runs only the repo-standard lint — a red sibling test does not block the push', () => {
    const d = governed(join(tmp, 'ih6'))
    run(['--target', d], tmp)
    writeFileSync(join(d, 'acceptance', 'test-their-thing.mjs'), 'process.exit(1)\n')
    const r = runHook(d)
    assert.equal(r.code, 0, "someone else's failing test is their business, not this hook's")
  })

  // ─────────────────────────────────────────────────────── IH7 the hook is honest
  check('IH7 the payload hook documents the escape hatch, removal, and that CI is the gate', () => {
    const src = readFileSync(PAYLOAD_HOOK, 'utf8')
    assert.match(src, /^#!\/bin\/sh/, 'POSIX sh — no bash dependency')
    for (const claim of ['--no-verify', 'rm .git/hooks/pre-push', 'NOT the gate']) {
      assert.ok(src.includes(claim), `the hook must document "${claim}"`)
    }
    assert.ok(!/enforce/i.test(src.replace(/never be enforcement/gi, '')), 'the hook must not claim to enforce anything')
  })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
