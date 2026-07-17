#!/usr/bin/env node
/*
 * test-skill-wiring.mjs — the skill layer is wired to real files with real grants.
 *
 * WHY: SKILL.md is prose the agent follows; a renamed engine, a payload path typo, or a missing
 * tool grant fails silently at runtime, in someone else's repo, mid-scaffold. This test binds the
 * prose to the tree: every engine and payload asset a skill references must exist, and every
 * engine it runs must be granted in its allowed-tools.
 *
 *   W1  the skill roster is exactly the built set (a directory each, with a SKILL.md).
 *   W2  every SKILL.md has frontmatter (name == dir, description, allowed-tools) + the fixed
 *       section anatomy (When to use / Prerequisites / Steps / Automated vs. manual recap /
 *       What feeds the next skill).
 *   W3  every ${CLAUDE_PLUGIN_ROOT}/harness/<engine>.mjs a skill invokes exists AND is granted.
 *   W4  every Bash(node *harness/<x>.mjs *) grant names a real engine (no dead grants).
 *   W5  every ${CLAUDE_PLUGIN_ROOT}/payload/... path a skill references exists on disk.
 *   W6  plugin.json is coherent: parses, points skills at ./skills/, semver version,
 *       and its license id matches the LICENSE file actually shipped.
 *   W7  this repo publishes NO marketplace of its own. A marketplace name is a GLOBAL key in
 *       the user's settings, so a namespace needs exactly one authority: when this repo and
 *       sf-security-review-toolkit each shipped a marketplace.json claiming `runverdict-plugins`
 *       and listing only themselves, `marketplace add` of the second REPLACED the first and
 *       knocked its installed plugins to "failed to load". The catalog lives in
 *       runverdict/claude-plugins, which lists every toolkit with a url source; this repo ships
 *       a plugin.json and stays out of the namespace business.
 *   W8  every `gh …` command a skill documents is covered by a Bash grant in its
 *       allowed-tools — a documented command with no grant fails at runtime, mid-scaffold,
 *       in someone else's repo (the same binding W3 gives the harness engines).
 *
 * Dependency-free: `node acceptance/test-skill-wiring.mjs`.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

let pass = 0, fail = 0
const check = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`) } catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`) } }

const EXPECTED_ROSTER = ['scaffold']
const REQUIRED_SECTIONS = ['## When to use', '## Prerequisites', '## Steps', '## Automated vs. manual recap', '## What feeds the next skill']

console.log('skill-wiring standing test')

const skillDirs = readdirSync(join(ROOT, 'skills')).filter((d) => statSync(join(ROOT, 'skills', d)).isDirectory()).sort()

check('W1 the skill roster is exactly the built set, each with a non-empty SKILL.md', () => {
  assert.deepEqual(skillDirs, EXPECTED_ROSTER, `skills/ contains [${skillDirs}] — expected [${EXPECTED_ROSTER}]`)
  for (const d of skillDirs) assert.ok(read(`skills/${d}/SKILL.md`).length > 500, `skills/${d}/SKILL.md is suspiciously small`)
})

const frontmatter = (text) => {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  assert.ok(m, 'SKILL.md must open with YAML frontmatter')
  return m[1]
}

check('W2 every SKILL.md has frontmatter (name == dir, description, allowed-tools) + the fixed anatomy', () => {
  for (const d of skillDirs) {
    const text = read(`skills/${d}/SKILL.md`)
    const fm = frontmatter(text)
    assert.match(fm, new RegExp(`^name: ${d}$`, 'm'), `skills/${d}: frontmatter name must equal the dir basename`)
    assert.match(fm, /^description: \S/m, `skills/${d}: frontmatter needs a description`)
    assert.match(fm, /^allowed-tools: \S/m, `skills/${d}: frontmatter needs allowed-tools (narrowest workable set)`)
    for (const s of REQUIRED_SECTIONS) assert.ok(text.includes(`\n${s}`), `skills/${d}: missing the "${s}" section`)
  }
})

const engineRefs = (text) => [...text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/harness\/([a-z0-9-]+)\.mjs/g)].map((m) => m[1])
const engineGrants = (fm) => [...fm.matchAll(/Bash\(node \*harness\/([a-z0-9-]+)\.mjs \*\)/g)].map((m) => m[1])
const grantsEngine = (fm, engine) => /(^|\s)Bash(\s|$)/.test(fm.match(/^allowed-tools: (.*)$/m)?.[1] ?? '') || engineGrants(fm).includes(engine)

check('W3 every harness engine a skill invokes exists AND is granted in its allowed-tools', () => {
  for (const d of skillDirs) {
    const text = read(`skills/${d}/SKILL.md`)
    const fm = frontmatter(text)
    for (const engine of new Set(engineRefs(text))) {
      assert.ok(existsSync(join(ROOT, 'harness', `${engine}.mjs`)), `skills/${d} invokes harness/${engine}.mjs which does not exist`)
      assert.ok(grantsEngine(fm, engine), `skills/${d} invokes harness/${engine}.mjs but allowed-tools does not grant Bash(node *harness/${engine}.mjs *)`)
    }
  }
})

check('W4 every engine grant names a real harness engine (no dead grants)', () => {
  for (const d of skillDirs) {
    for (const engine of engineGrants(frontmatter(read(`skills/${d}/SKILL.md`)))) {
      assert.ok(existsSync(join(ROOT, 'harness', `${engine}.mjs`)), `skills/${d} grants harness/${engine}.mjs which does not exist — dead grant`)
    }
  }
})

check('W5 every payload path a skill references exists on disk', () => {
  for (const d of skillDirs) {
    const text = read(`skills/${d}/SKILL.md`)
    const refs = new Set([...text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/(payload\/[A-Za-z0-9_./-]*[A-Za-z0-9_-])/g)].map((m) => m[1]))
    assert.ok(refs.size > 0, `skills/${d} references no payload assets — the scaffolder must install from payload/`)
    for (const rel of refs) assert.ok(existsSync(join(ROOT, rel)), `skills/${d} references ${rel} which does not exist`)
  }
})

check('W6 plugin.json is coherent (skills dir, semver version, license matches the shipped LICENSE)', () => {
  const pj = JSON.parse(read('.claude-plugin/plugin.json'))
  assert.equal(pj.skills, './skills/', 'plugin.json skills must point at ./skills/')
  assert.match(pj.version, /^\d+\.\d+\.\d+$/, 'plugin.json version must be plain semver')
  assert.equal(pj.license, 'Apache-2.0', 'plugin.json license id')
  assert.match(read('LICENSE'), /Apache License/, 'the shipped LICENSE file must be the Apache License text plugin.json claims')
  assert.ok(pj.description.length > 80, 'plugin.json description should say what the plugin does, concretely')
})

check('W7 this repo publishes no marketplace of its own (one namespace, one authority)', () => {
  // A marketplace name is a bare global key in the user's settings (`extraKnownMarketplaces`),
  // and `marketplace add` registers whatever catalog that name resolves to. If this repo also
  // published `runverdict-plugins`, adding it would REPLACE the catalog in
  // runverdict/claude-plugins and every plugin installed from it would stop resolving. That is
  // not hypothetical — it is exactly what happened to sf-security-review-toolkit. The catalog
  // has one home; this repo ships a plugin.json and is listed FROM there.
  assert.ok(!existsSync(join(ROOT, '.claude-plugin', 'marketplace.json')),
    'this repo must not ship .claude-plugin/marketplace.json — the runverdict-plugins catalog lives in runverdict/claude-plugins, and a second repo claiming that name silently breaks every plugin installed from the real one')
  // the README must point installers at the catalog, not at this repo
  const rm = read('README.md')
  assert.ok(rm.includes('marketplace add runverdict/claude-plugins'),
    'README Install must add the catalog repo (runverdict/claude-plugins), not this repo — `marketplace add runverdict/repo-standard-toolkit` has no marketplace to find')
  assert.ok(rm.includes(`plugin install ${JSON.parse(read('.claude-plugin/plugin.json')).name}@runverdict-plugins`),
    'README Install must install this plugin from the runverdict-plugins namespace')
})

check('W8 every gh command a skill documents is covered by a Bash grant in allowed-tools', () => {
  let bound = 0
  for (const d of skillDirs) {
    const text = read(`skills/${d}/SKILL.md`)
    const fm = frontmatter(text)
    const grants = [...(fm.match(/^allowed-tools: (.*)$/m)?.[1] ?? '').matchAll(/Bash\(([^)]*)\)/g)].map((m) => m[1])
    // backticked `gh …` commands in the body are what the agent will actually run; the grant
    // patterns here are simple prefix globs (trailing *), which is all this repo uses.
    for (const [, cmd] of text.matchAll(/`(gh [^`]+)`/g)) {
      bound++
      const covered = grants.some((g) => cmd.startsWith(g.endsWith('*') ? g.slice(0, -1) : g))
      assert.ok(covered, `skills/${d} documents \`${cmd}\` but no Bash grant in allowed-tools covers it — the step fails at runtime, mid-scaffold, in someone else's repo`)
    }
  }
  assert.ok(bound >= 2, `expected the documented gh commands to be found (got ${bound}) — refusing a vacuous pass`)
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
