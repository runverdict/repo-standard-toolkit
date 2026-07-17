#!/usr/bin/env node
/*
 * test-changelog-version.mjs — standing acceptance test for the CHANGELOG.md ⟺
 * .claude-plugin/plugin.json version lockstep of THIS plugin repo.
 *
 * WHY: a plugin that ships repo-hygiene gates must live under its own — bump one version
 * source, forget the other, and the build reddens instead of drifting silently.
 *
 * Guards:
 *   CV1 CHANGELOG.md exists and has the Keep a Changelog shape: a top-level `# Changelog`
 *       title, cites keepachangelog.com, and an `## [Unreleased]` section. Concrete
 *       `## [x.y.z]` sections are OPTIONAL pre-first-release — version headings correspond
 *       to REAL tagged releases, not hypothetical ones.
 *   CV2 every concrete version heading is valid semver, in DESCENDING order (newest first).
 *   CV3 THE LOCK: once a dated release exists, the newest concrete CHANGELOG version ===
 *       `.claude-plugin/plugin.json` version. Pre-first-release (no dated version yet) the
 *       lockstep is dormant.
 *   CV4 plugin.json declares the identity the catalog installs it by (name + repository). The
 *       marketplace catalog itself lives in runverdict/claude-plugins — one namespace, one
 *       authority — so there is no local marketplace.json to cross-check (see W7).
 *   CV5 the payload lint's REPO_STANDARD_LINT_VERSION === plugin.json version. sense-state
 *       orders upgrade vs. downgrade by that constant, so a constant that lags the release
 *       would misdirect every governed repo's re-run.
 *
 * NOTE: CHANGELOG.md may not exist yet — CV1-CV3 then fail as named checks (never a crash),
 * because the file will land before this suite gates the repo.
 *
 * Dependency-free: node acceptance/test-changelog-version.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

let pass = 0, fail = 0
const check = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`) } catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`) }
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const cmp = (a, b) => {
  const pa = a.split('-')[0].split('.').map(Number), pb = b.split('-')[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

// Lazy-loaded so a missing CHANGELOG.md fails the checks that need it, never crashes the run.
const loadChangelog = () => {
  assert.ok(existsSync(join(ROOT, 'CHANGELOG.md')), 'CHANGELOG.md exists at the repo root (not scaffolded yet)')
  return read('CHANGELOG.md')
}
// Every `## [<token>]` heading, in document order. <token> is 'Unreleased' or a semver.
const headingsOf = (changelog) => [...changelog.matchAll(/^##\s+\[([^\]]+)\]/gm)].map((m) => m[1])
const versionsOf = (changelog) => headingsOf(changelog).filter((h) => h.toLowerCase() !== 'unreleased')

console.log('changelog-version standing test')

check('CV1 CHANGELOG.md has the Keep a Changelog shape (# Changelog, cites keepachangelog.com, [Unreleased]; versions optional pre-release)', () => {
  const changelog = loadChangelog()
  assert.match(changelog, /^#\s+Changelog/m, 'a top-level "# Changelog" title')
  assert.match(changelog, /keepachangelog\.com/i, 'names the Keep a Changelog format')
  assert.ok(headingsOf(changelog).some((h) => h.toLowerCase() === 'unreleased'), 'an [Unreleased] section exists')
  // concrete version sections are OPTIONAL — pre-first-release, work lives under [Unreleased].
})

check('CV2 every version heading is valid semver, in descending order', () => {
  const versions = versionsOf(loadChangelog())
  for (const v of versions) assert.match(v, SEMVER, `"${v}" is a valid semver`)
  for (let i = 1; i < versions.length; i++) {
    assert.ok(cmp(versions[i - 1], versions[i]) >= 0, `versions descend: ${versions[i - 1]} before ${versions[i]}`)
  }
})

check('CV3 LOCK: once a release is dated, the newest CHANGELOG version === plugin.json version', () => {
  const pluginVersion = JSON.parse(read('.claude-plugin/plugin.json')).version
  assert.match(pluginVersion, SEMVER, `plugin.json version "${pluginVersion}" is valid semver`)
  const versions = versionsOf(loadChangelog())
  if (versions.length === 0) return // pre-first-release: no dated version yet; the lockstep engages at the first tag
  assert.equal(versions[0], pluginVersion,
    `the newest CHANGELOG version (${versions[0]}) must match .claude-plugin/plugin.json (${pluginVersion}) — bump both in lockstep when cutting a release`)
})

check('CV4 plugin.json declares the identity the catalog installs it by', () => {
  // The marketplace catalog lives in runverdict/claude-plugins (one namespace, one authority —
  // see W7 in test-skill-wiring), so there is no local marketplace.json to cross-check against.
  // What this repo owns is its own identity: the name the catalog lists and users install by.
  const pj = JSON.parse(read('.claude-plugin/plugin.json'))
  assert.equal(pj.name, 'repo-standard-toolkit', 'plugin.json name is the install identity the catalog references')
  assert.match(pj.repository, /github\.com\/runverdict\/repo-standard-toolkit/, 'plugin.json repository must be the repo the catalog sources from')
})

check('CV5 the payload lint\'s embedded version constant is in lockstep with plugin.json', () => {
  const pluginVersion = JSON.parse(read('.claude-plugin/plugin.json')).version
  const m = read('payload/acceptance/test-repo-standard.mjs').match(/^const REPO_STANDARD_LINT_VERSION = '([^'\n]+)'/m)
  assert.ok(m, "the payload lint must carry a `const REPO_STANDARD_LINT_VERSION = '<semver>'` line — sense-state parses it to direct upgrade vs. downgrade")
  assert.match(m[1], SEMVER, `REPO_STANDARD_LINT_VERSION "${m[1]}" is valid semver`)
  assert.equal(m[1], pluginVersion,
    `REPO_STANDARD_LINT_VERSION (${m[1]}) must equal .claude-plugin/plugin.json (${pluginVersion}) — bump the constant with the plugin version, or a re-run misreads which lint is newer`)
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
