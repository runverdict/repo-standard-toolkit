#!/usr/bin/env node
/*
 * sense-state.mjs — the read-only inventory that tells the scaffolder what kind of repo it is
 * standing in, so greenfield vs. mid-project is DETECTED, never assumed.
 *
 * Reports, per standard artifact, whether it exists (and opens with an H1) and where it lives
 * (GitHub serves README + community health files with .github/ > root > docs/ precedence — the
 * sensed path is the one GitHub serves, lower-precedence duplicates are named); whether the
 * enforcement layer is installed (the committed lint — and whether it is byte-identical to this
 * plugin's payload copy — the config, a CI workflow that runs the acceptance suite); the repo
 * signals a scaffolder can derive placeholder values from (git remote, manifests); and a
 * deterministic classification + per-artifact action plan:
 *
 *   greenfield — none of the governed docs exist yet (a LICENSE alone still counts as greenfield)
 *   partial    — some governed docs exist; scaffold the gaps, audit the rest
 *   governed   — all docs + lint + config + CI gate present; a re-run is reconcile-only
 *
 * Plan actions: scaffold (missing → fill from template) · audit (exists → run the lint, reconcile
 * only what reddens) · install (enforcement file missing) · keep (byte-identical) · repair (the
 * config does not parse) · and, when the installed lint differs from the payload, a DIRECTED
 * verdict from the version constant each lint carries: upgrade (payload newer — replace
 * wholesale, config carries the repo specifics) · downgrade (payload OLDER — the plugin is
 * stale; replacing would regress the repo's committed gate while calling it an upgrade, so the
 * skill must stop) · local-edit (same version, different bytes — someone edited a copy; diff
 * before touching).
 *
 * READ-ONLY by design: this engine never writes, never runs the lint (that is a separate,
 * visible step), and shells out only to read-only `git` queries. It never reads the clock — the
 * same tree always senses the same. Not configurable by .repo-standard.json: it reports the
 * STANDARD set; the lint is what consults the config.
 *
 * Usage: node harness/sense-state.mjs [--target <dir>] [--json]
 * Dependency-free: Node built-ins only. Exit 0 sensed · 2 bad invocation.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PAYLOAD_LINT = fileURLToPath(new URL('../payload/acceptance/test-repo-standard.mjs', import.meta.url))
const DOCS = ['README.md', 'CHANGELOG.md', 'CONVENTIONS.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md']
const LINT_REL = 'acceptance/test-repo-standard.mjs'
const CONFIG_REL = '.repo-standard.json'

const fail = (msg) => { console.error(`sense-state: ${msg}`); process.exit(2) }

const args = process.argv.slice(2)
let target = '.', asJson = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--target') target = args[++i] || fail('--target expects a directory')
  else if (args[i] === '--json') asJson = true
  else fail(`unknown argument "${args[i]}"`)
}
target = resolve(target)
if (!existsSync(target) || !statSync(target).isDirectory()) fail(`target is not a directory: ${target}`)

const readIf = (rel) => { try { return readFileSync(join(target, rel), 'utf8').replace(/^﻿/, '') } catch { return null } }
const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const git = (...argv) => {
  try { return execFileSync('git', ['-C', target, ...argv], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null }
}
// `git -C <dir>` walks UP to find a repo, so a plain directory nested inside an unrelated
// checkout would otherwise inherit that repo's name, remote, and history. Only trust git when
// the discovered worktree IS the target.
const gitOwnsTarget = git('rev-parse', '--show-toplevel') === target

// ---- artifacts ----
// "opens with an H1" means the document's FIRST content is an ATX H1 — an unanchored /^# /m
// would match a `# comment` inside a fenced bash block, which nearly every README has.
const opensWithH1 = (text) => {
  const first = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('<!--'))[0] || ''
  return /^# +\S/.test(first)
}
const artifacts = {}
// a path is a candidate only if it is a readable FILE — existsSync alone would let a
// DIRECTORY named .github/README.md mask a healthy root README as "missing".
const isFile = (p) => { try { return statSync(join(target, p)).isFile() } catch { return false } }
for (const doc of DOCS) {
  // GitHub serves README and the community health files with precedence .github/ > root >
  // docs/ — sense where a doc ACTUALLY lives, so the plan audits an existing .github/ copy
  // instead of scaffolding a root duplicate that would shadow it or be shadowed by it. The
  // first hit is what GitHub renders; further hits are duplicates the lint's RS-shadow reddens.
  const found = [`.github/${doc}`, doc, `docs/${doc}`].filter(isFile)
  const text = found.length ? readIf(found[0]) : null
  artifacts[doc] = text === null
    ? { exists: false }
    : {
      exists: true,
      path: found[0],
      bytes: Buffer.byteLength(text),
      hasH1: opensWithH1(text),
      ...(found.length > 1 ? { duplicates: found.slice(1) } : {}),
    }
}
// licensee's filename family, most conventional first — mirrored in the payload lint's
// RS-license candidates: a repo licensed via COPYING (the GPL convention) or LICENSE.md is
// licensed, not license-less, and scaffolding a second license file beside it would break
// GitHub's license detection outright.
const LICENSE_CANDIDATES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'LICENCE.txt', 'COPYING', 'COPYING.md', 'COPYING.txt', 'UNLICENSE']
const licenseFileRel = LICENSE_CANDIDATES.find(isFile) ?? null
const licenseText = licenseFileRel ? readIf(licenseFileRel) : null
artifacts.LICENSE = licenseText === null ? { exists: false } : { exists: true, path: licenseFileRel, bytes: Buffer.byteLength(licenseText) }

// ---- enforcement ----
const lintText = readIf(LINT_REL)
const payloadText = existsSync(PAYLOAD_LINT) ? readFileSync(PAYLOAD_LINT, 'utf8') : null
// the machine-readable version each lint copy carries (the payload lint's REPO_STANDARD_LINT_
// VERSION constant, locked to the plugin version by an acceptance test). null = a copy from
// before versioning existed — older than every versioned payload by construction.
const lintVersionOf = (text) => text?.match(/^const REPO_STANDARD_LINT_VERSION = '([^'\n]+)'/m)?.[1] ?? null
// semver compare, enough for plugin versions: numeric triple, then a prerelease is older than
// its release, then prerelease identifiers left to right (numeric < alphanumeric, numeric
// numerically, alphanumeric by ASCII).
const semverCmp = (a, b) => {
  const pa = a.split('-')[0].split('.').map(Number), pb = b.split('-')[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  const preA = a.includes('-') ? a.slice(a.indexOf('-') + 1).split('.') : null
  const preB = b.includes('-') ? b.slice(b.indexOf('-') + 1).split('.') : null
  if (!preA || !preB) return (preA ? -1 : 0) - (preB ? -1 : 0)
  for (let i = 0; i < Math.max(preA.length, preB.length); i++) {
    if (preA[i] === undefined) return -1
    if (preB[i] === undefined) return 1
    const na = /^\d+$/.test(preA[i]), nb = /^\d+$/.test(preB[i])
    if (na && nb) { const d = Number(preA[i]) - Number(preB[i]); if (d) return d }
    else if (na !== nb) return na ? -1 : 1
    else if (preA[i] !== preB[i]) return preA[i] < preB[i] ? -1 : 1
  }
  return 0
}
const configText = readIf(CONFIG_REL)
let configValid = null
if (configText !== null) { try { JSON.parse(configText); configValid = true } catch { configValid = false } }

const wfDir = join(target, '.github', 'workflows')
const workflows = existsSync(wfDir) ? readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)).sort() : []
// a workflow is the GATE only if it runs the whole suite (the canonical for-loop) or at least
// the repo-standard lint by name — merely mentioning some acceptance test is not a gate (a
// pre-existing workflow running one unrelated test must not satisfy the install plan).
// anchored at the COMMAND position: the gate must be what a step actually runs, not merely a
// string that appears somewhere in the file. A `#`-commented line and `echo "… node
// acceptance/test-repo-standard.mjs …"` both mention it and neither runs it.
const GATE_RE = /^(?:for t in acceptance\/test-\*\.mjs|node acceptance\/test-repo-standard\.mjs)/
const runsGate = (yml) => (yml || '').split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .map((l) => l.replace(/\s#.*$/, '').trim().replace(/^-\s*/, '').replace(/^run:\s*/, '').trim())
  .some((l) => GATE_RE.test(l))
const ciRunsAcceptance = workflows.some((f) => runsGate(readIf(join('.github', 'workflows', f))))

const acceptDir = join(target, 'acceptance')
const existingTests = existsSync(acceptDir) ? readdirSync(acceptDir).filter((f) => /^test-.*\.mjs$/.test(f)).sort() : []

const installedLintVersion = lintVersionOf(lintText)
const payloadLintVersion = lintVersionOf(payloadText)
// direction of a differing lint, decided by version, never by assumption: an unversioned
// installed copy predates every versioned payload (upgrade); an unversioned PAYLOAD can never
// prove it is newer, so the honest verdict is local-edit, not a claimed upgrade.
const lintDrift = () => {
  if (installedLintVersion && payloadLintVersion) {
    const d = semverCmp(payloadLintVersion, installedLintVersion)
    return d > 0 ? 'upgrade' : d < 0 ? 'downgrade' : 'local-edit'
  }
  return payloadLintVersion ? 'upgrade' : 'local-edit'
}

const enforcement = {
  lint: {
    path: LINT_REL,
    installed: lintText !== null,
    matchesPayload: lintText !== null && payloadText !== null ? sha256(lintText) === sha256(payloadText) : null,
    installedVersion: installedLintVersion,
    payloadVersion: payloadLintVersion,
  },
  config: { path: CONFIG_REL, present: configText !== null, valid: configValid },
  ci: { workflows, runsAcceptance: ciRunsAcceptance },
  existingAcceptanceTests: existingTests,
}

// ---- signals a scaffolder can derive placeholder values from ----
const manifests = {}
const pkgText = readIf('package.json')
if (pkgText) { try { const p = JSON.parse(pkgText); manifests['package.json'] = { name: p.name ?? null, version: p.version ?? null, description: p.description ?? null, license: p.license ?? null, repository: typeof p.repository === 'string' ? p.repository : p.repository?.url ?? null } } catch { manifests['package.json'] = { parseError: true } } }
const cpText = readIf('.claude-plugin/plugin.json')
if (cpText) { try { const p = JSON.parse(cpText); manifests['.claude-plugin/plugin.json'] = { name: p.name ?? null, version: p.version ?? null, description: p.description ?? null, license: p.license ?? null, repository: p.repository ?? null } } catch { manifests['.claude-plugin/plugin.json'] = { parseError: true } } }
const pyText = readIf('pyproject.toml')
if (pyText) manifests['pyproject.toml'] = { version: pyText.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null, name: pyText.match(/^name\s*=\s*"([^"]+)"/m)?.[1] ?? null }
const cargoText = readIf('Cargo.toml')
if (cargoText) manifests['Cargo.toml'] = { version: cargoText.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null, name: cargoText.match(/^name\s*=\s*"([^"]+)"/m)?.[1] ?? null }

const remoteUrl = gitOwnsTarget ? git('remote', 'get-url', 'origin') : null
// the repo's DEFAULT branch, not whatever is checked out: scaffolding happens on a topic branch
// far more often than not, and this value gets baked into docs. In descending order of
// authority — origin/HEAD says it outright; an existing local main/master is strong evidence
// (git itself has no notion of a default without a remote); init.defaultBranch is only a
// preference for NEW repos, so it ranks below real branches; the current branch is the last
// resort and is exactly the wrong answer on a topic branch, hence last.
const branchExists = (b) => git('rev-parse', '--verify', '--quiet', `refs/heads/${b}`) !== null
const defaultBranch = gitOwnsTarget
  ? (git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD')?.replace(/^origin\//, '')
    ?? (branchExists('main') ? 'main' : branchExists('master') ? 'master' : null)
    ?? git('config', '--get', 'init.defaultBranch')
    ?? git('symbolic-ref', '--short', 'HEAD'))
  : null
const gitSignals = {
  isRepo: gitOwnsTarget,
  commitCount: gitOwnsTarget ? Number(git('rev-list', '--count', 'HEAD') ?? 0) : 0,
  defaultBranch,
  remoteUrl,
}

// pick the first manifest that actually PARSED — a broken package.json must not shadow a valid
// pyproject.toml sitting beside it (`??` would stop on the truthy {parseError:true} sentinel).
const manifest = ['.claude-plugin/plugin.json', 'package.json', 'pyproject.toml', 'Cargo.toml']
  .map((k) => manifests[k]).find((m) => m && !m.parseError) ?? null
const repoUrl = remoteUrl ? remoteUrl.replace(/\.git$/, '').replace(/^git@([^:]+):/, 'https://$1/') : null
// a repo "already has a license" when EITHER the manifest declares one or the LICENSE file is a
// recognizable standard text — the manifest field alone misses every LICENSE-file-only repo.
// each arm must key on what DISTINGUISHES its license: the BSD family shares one preamble
// verbatim, so only the third clause separates BSD-3 from BSD-2, and MIT's grant sentence also
// appears in other permissive texts — order and specificity both matter here, because this
// value becomes the {{LICENSE_ID}} a scaffolded repo declares.
const licenseFromFile = licenseText === null ? null
  : /Apache License\s*\n\s*Version 2\.0/.test(licenseText) ? 'Apache-2.0'
  : /GNU GENERAL PUBLIC LICENSE\s*\n\s*Version 3/.test(licenseText) ? 'GPL-3.0'
  : /Mozilla Public License Version 2\.0/.test(licenseText) ? 'MPL-2.0'
  : /Neither the name of the copyright holder|BSD 3-Clause/i.test(licenseText) ? 'BSD-3-Clause'
  : /BSD 2-Clause/i.test(licenseText) ? 'BSD-2-Clause'
  : /^MIT License/m.test(licenseText) ? 'MIT'
  : /Redistribution and use in source and binary forms/.test(licenseText) ? 'unrecognized' // some BSD variant; say so rather than guess
  : /Permission is hereby granted, free of charge/.test(licenseText) ? 'MIT'
  : 'unrecognized'
// tagline fallback: the first paragraph line after the existing README's H1 (the repo already
// states its own tagline on its front page — do not re-ask the operator for it). Read the
// SENSED README — a repo whose README lives in .github/ or docs/ states its tagline there.
const readmeText = artifacts['README.md'].exists ? readIf(artifacts['README.md'].path) : null
let readmeTagline = null
if (readmeText) {
  const h1 = readmeText.match(/^# +.+$/m)
  if (h1) {
    // slice from the match's own position (indexOf would find the H1's text if it also appears
    // earlier in prose), skip the badge/banner run, then strip bold markers rather than
    // splitting on them — `A **fast** parser` must survive whole, not truncate to "A".
    const after = readmeText.slice(h1.index + h1[0].length).split('\n').map((l) => l.trim())
      .filter((l) => l && !l.startsWith('<!--') && !l.startsWith('>')
        && !/^!\[|^\[!\[/.test(l) && !/^<\/?[a-z][^>]*>$/i.test(l) && !/^<img\s/.test(l))[0] || null
    readmeTagline = after ? after.replace(/\*\*/g, '').trim() || null : null
  }
}
const derived = {
  projectName: manifest?.name ?? (repoUrl ? repoUrl.split('/').pop() : null),
  tagline: manifest?.description ?? readmeTagline,
  repoUrl,
  repoSlug: repoUrl ? repoUrl.split('/').slice(-2).join('/') : null,
  licenseId: manifest?.license ?? licenseFromFile,
  defaultBranch: defaultBranch ?? 'main',
}

// ---- classification + plan (deterministic) ----
const docsPresent = DOCS.filter((d) => artifacts[d].exists)
const allDocs = docsPresent.length === DOCS.length && artifacts.LICENSE.exists
// a config the lint cannot parse is not enforcement — the gate is broken, so the repo is not
// governed no matter what else is installed.
const enforced = enforcement.lint.installed && enforcement.config.present && enforcement.config.valid !== false && ciRunsAcceptance
const classification = docsPresent.length === 0 ? 'greenfield' : allDocs && enforced ? 'governed' : 'partial'

const plan = []
for (const doc of [...DOCS, 'LICENSE']) plan.push({ artifact: doc, action: artifacts[doc].exists ? 'audit' : 'scaffold' })
plan.push({ artifact: LINT_REL, action: !enforcement.lint.installed ? 'install' : enforcement.lint.matchesPayload ? 'keep' : lintDrift() })
plan.push({ artifact: CONFIG_REL, action: !enforcement.config.present ? 'install' : enforcement.config.valid === false ? 'repair' : 'audit' })
plan.push({ artifact: '.github/workflows (acceptance gate)', action: ciRunsAcceptance ? 'keep' : 'install' })

const report = { target, classification, artifacts, enforcement, signals: { git: gitSignals, manifests }, derived, plan }

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`sense-state: ${target}`)
  console.log(`  classification: ${classification}`)
  for (const doc of [...DOCS, 'LICENSE']) {
    const a = artifacts[doc]
    const notes = [
      a.exists && a.hasH1 === false ? '(no H1)' : null,
      a.exists && a.path && a.path !== doc ? `(at ${a.path})` : null,
      a.exists && a.duplicates ? `(DUPLICATE: also at ${a.duplicates.join(', ')} — one governed copy only; the lint's RS-shadow reddens on this)` : null,
    ].filter(Boolean)
    console.log(`  ${a.exists ? '●' : '○'} ${doc}${notes.length ? '  ' + notes.join(' ') : ''}`)
  }
  const lintNote = !enforcement.lint.installed ? ''
    : enforcement.lint.matchesPayload ? ' (matches payload)'
    : ` (DIFFERS from payload — ${lintDrift()}: installed ${installedLintVersion ?? 'unversioned'}, payload ${payloadLintVersion ?? 'unversioned'})`
  console.log(`  ${enforcement.lint.installed ? '●' : '○'} ${LINT_REL}${lintNote}`)
  if (enforcement.lint.installed && !enforcement.lint.matchesPayload && lintDrift() === 'downgrade') {
    console.log(`  ! STALE PLUGIN: the installed plugin's payload (${payloadLintVersion}) is OLDER than the lint governing this repo (${installedLintVersion}) — replacing would downgrade the committed gate; update the plugin instead`)
  }
  console.log(`  ${enforcement.config.present ? '●' : '○'} ${CONFIG_REL}${enforcement.config.valid === false ? ' (INVALID JSON)' : ''}`)
  console.log(`  ${ciRunsAcceptance ? '●' : '○'} CI acceptance gate${workflows.length ? ` (workflows: ${workflows.join(', ')})` : ''}`)
  console.log('  plan:')
  for (const p of plan) console.log(`    ${p.action.padEnd(8)} ${p.artifact}`)
}
