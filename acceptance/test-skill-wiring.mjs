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
 *   W7  marketplace.json is coherent AND its name does not squat a marketplace another repo
 *       already publishes — the name is a GLOBAL key in the user's settings, so a collision
 *       silently replaces the other repo's entry and breaks every plugin installed from it
 *       (this happened: `runverdict-plugins` collided with sf-security-review-toolkit's
 *       marketplace and knocked it to "failed to load"). The name must be repo-specific.
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

check('W7 marketplace.json is coherent and its name is repo-specific (a global key — collisions break other repos)', () => {
  const pj = JSON.parse(read('.claude-plugin/plugin.json'))
  const mk = JSON.parse(read('.claude-plugin/marketplace.json'))
  assert.ok((mk.plugins || []).some((p) => p.name === pj.name), `marketplace.json must list a plugin named "${pj.name}"`)
  for (const p of mk.plugins || []) {
    assert.ok(existsSync(join(ROOT, p.source || '')), `marketplace.json plugin "${p.name}" has source "${p.source}" which does not exist`)
  }
  // The marketplace name lands in the user's settings under `extraKnownMarketplaces` as a bare
  // key. Two repos claiming one name is not a merge — the last `marketplace add` wins and the
  // loser's installed plugins stop resolving. Anchor the name to THIS repo.
  assert.ok(mk.name.includes('repo-standard'),
    `marketplace name "${mk.name}" is not anchored to this repo — a generic org-wide name (e.g. "runverdict-plugins") collides with any sibling repo publishing the same name and silently breaks its installs. Use a repo-specific name.`)
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
