#!/usr/bin/env node
/*
 * install-hook.mjs — install the OPTIONAL pre-push hygiene check into a governed repo.
 *
 * The hook is a CONVENIENCE, never a gate: it is per-clone, uncommitted, skippable with
 * `git push --no-verify`, and absent for anyone who clones fresh. Enforcement stays where it
 * belongs — the committed lint, run by CI, on every push. This engine exists because the
 * install has real refusal conditions, and a determinizable refusal belongs in an engine rather
 * than in prose an agent might not follow (CONVENTIONS §2).
 *
 * It refuses, loudly, rather than surprising anyone:
 *   - not a git repo, or --target is not the repo root (never touch a parent repo's hooks),
 *   - the repo is not governed yet (no acceptance/test-repo-standard.mjs — the hook would be a
 *     no-op today and a mystery later; scaffold first),
 *   - a pre-push hook already exists (someone else's automation; never clobber it),
 *   - core.hooksPath points elsewhere (husky et al) — installing into .git/hooks would put the
 *     file somewhere git will never read, i.e. a silent no-op dressed up as success.
 *
 * Usage:
 *   node harness/install-hook.mjs [--target <dir>] [--check] [--uninstall] [--force]
 *
 * --check reports what would happen and writes nothing. --force replaces an existing pre-push
 * hook (only after the operator has seen what is there). --uninstall removes a hook this
 * toolkit installed, and refuses to remove one it did not.
 *
 * Dependency-free: Node built-ins only. Exit 0 done · 1 --check found work · 2 refused.
 */
import { readFileSync, writeFileSync, existsSync, statSync, chmodSync, unlinkSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PAYLOAD_HOOK = fileURLToPath(new URL('../payload/hooks/pre-push', import.meta.url))
const MARKER = 'repo-standard pre-push' // identifies a hook THIS toolkit wrote

const fail = (msg) => { console.error(`install-hook: ${msg}`); process.exit(2) }

const args = process.argv.slice(2)
let target = '.', check = false, uninstall = false, force = false
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--target') { const v = args[++i]; if (!v || v.startsWith('--')) fail('--target expects a directory'); target = v }
  else if (a === '--check') check = true
  else if (a === '--uninstall') uninstall = true
  else if (a === '--force') force = true
  else fail(`unknown argument "${a}"`)
}
target = resolve(target)
if (!existsSync(target) || !statSync(target).isDirectory()) fail(`target is not a directory: ${target}`)

const git = (...argv) => {
  try { return execFileSync('git', ['-C', target, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null }
}

// --- refusal conditions, checked before anything is written ---
const topLevel = git('rev-parse', '--show-toplevel')
if (topLevel === null) fail(`${target} is not a git repository — the hook has nothing to attach to`)
if (topLevel !== target) fail(`${target} is inside the git repo at ${topLevel} but is not its root — refusing to touch a parent repo's hooks; re-run with --target ${topLevel}`)

const hooksPath = git('config', '--get', 'core.hooksPath')
if (hooksPath) fail(`core.hooksPath is set to "${hooksPath}", so git ignores .git/hooks entirely — installing there would be a silent no-op. Install the hook into "${hooksPath}" by hand, or unset core.hooksPath first.`)

const hookFile = join(topLevel, '.git', 'hooks', 'pre-push')
const installed = existsSync(hookFile)
const isOurs = installed && readFileSync(hookFile, 'utf8').includes(MARKER)

if (uninstall) {
  if (!installed) { console.log('install-hook: no pre-push hook installed — nothing to remove'); process.exit(0) }
  if (!isOurs && !force) fail(`the pre-push hook at ${hookFile} was not written by this toolkit — refusing to remove someone else's automation (pass --force only after reading it)`)
  if (check) { console.log(`install-hook: --check — would remove ${hookFile}`); process.exit(1) }
  unlinkSync(hookFile)
  console.log(`install-hook: removed ${hookFile}`)
  process.exit(0)
}

const isGoverned = existsSync(join(topLevel, 'acceptance', 'test-repo-standard.mjs'))

// --check answers a question and writes nothing, so it REPORTS every state rather than refusing
// any of them — "you would need --force" is the answer, not an error. (The environmental
// refusals above still exit 2 even here: they mean the question cannot be answered at all.)
if (check) {
  if (!isGoverned) {
    console.log('install-hook: --check — would refuse: this repo is not governed yet (no acceptance/test-repo-standard.mjs); scaffold the standard first')
    process.exit(1)
  }
  if (isOurs) {
    const current = readFileSync(hookFile, 'utf8') === readFileSync(PAYLOAD_HOOK, 'utf8')
    console.log(`install-hook: --check — pre-push installed and ${current ? 'current (nothing to do)' : 'OUT OF DATE (re-run without --check to update)'}`)
    process.exit(current ? 0 : 1)
  }
  console.log(`install-hook: --check — would install the pre-push hygiene check into ${hookFile}${installed ? ' (REPLACING an existing hook this toolkit did not write — --force required)' : ''}`)
  process.exit(1)
}

// the hook only makes sense once the standard is installed: it runs that lint and nothing else.
if (!isGoverned) {
  fail('this repo is not governed yet (no acceptance/test-repo-standard.mjs) — scaffold the standard first; a hook checking a lint that does not exist is a no-op today and a mystery later')
}
if (installed && !isOurs && !force) {
  fail(`a pre-push hook already exists at ${hookFile} and this toolkit did not write it — refusing to clobber someone else's automation. Read it, then pass --force to replace it, or merge the check in by hand.`)
}

mkdirSync(join(topLevel, '.git', 'hooks'), { recursive: true })
writeFileSync(hookFile, readFileSync(PAYLOAD_HOOK, 'utf8'))
chmodSync(hookFile, 0o755)
console.log(`install-hook: installed ${hookFile}`)
console.log('  It runs the repo-standard lint before each push and nothing else.')
console.log('  This is LOCAL convenience, not the gate — CI runs the same lint on every push (a required status check is what makes it block).')
console.log('  Skip once: git push --no-verify · Remove: node harness/install-hook.mjs --uninstall')
