#!/usr/bin/env node
/*
 * test-gate-posture.mjs — the shipped CI gate is a gate that cannot be wedged or hijacked.
 *
 * WHY: the payload workflows are the enforcement layer every governed repo inherits, so their
 * posture IS the product's posture. Three properties rot silently without a standing guard:
 * a required check whose workflow lacks the merge_group trigger DEADLOCKS a merge queue (every
 * queued PR waits forever for a check that never starts); an action pinned to a movable tag is
 * a supply-chain hole in the one file that gates everything else (OpenSSF Scorecard:
 * Pinned-Dependencies); and the ruleset payload that makes the check REQUIRED must stay
 * POSTable and must name the exact job the workflows actually run, or the skill installs a
 * rule that gates on nothing.
 *
 * Guards:
 *   GP1  both payload workflows trigger on push + pull_request + merge_group.
 *   GP2  every `uses:` in the payload workflows is pinned to a full 40-hex commit SHA with a
 *        human-readable `# v<tag>` comment (no movable tags in the gate).
 *   GP3  the ruleset payload parses, targets the default branch, ships in `evaluate`
 *        enforcement (dry-run by default — flipping to `active` is the operator's deliberate
 *        act), and carries the four rules: deletion, non_fast_forward, pull_request,
 *        required_status_checks in strict mode.
 *   GP4  the ruleset's required check context equals the job id both payload workflows define
 *        — the rule and the workflows can never name different checks.
 *
 * (The dogfood .github/workflows/test.yml is byte-locked to the payload workflow by PS2, so
 * everything proven here holds for this repo's own gate too.)
 *
 * Dependency-free: `node acceptance/test-gate-posture.mjs`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

let pass = 0, fail = 0
const check = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`) } catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e.message}`) } }

const WORKFLOWS = ['payload/workflows/repo-standard.yml', 'payload/workflows/repo-standard-scoped.yml']
const RULESET = 'payload/rulesets/repo-standard.json'

console.log('gate-posture standing test (the shipped gate cannot be wedged or hijacked)')

check('GP1 both payload workflows trigger on push + pull_request + merge_group', () => {
  for (const wf of WORKFLOWS) {
    const on = read(wf).match(/^on:\s*\[([^\]]*)\]/m)
    assert.ok(on, `${wf}: expected a single-line \`on: [...]\` trigger list`)
    const triggers = on[1].split(',').map((t) => t.trim()).sort()
    assert.deepEqual(triggers, ['merge_group', 'pull_request', 'push'],
      `${wf}: triggers must be exactly push + pull_request + merge_group (a required check without merge_group deadlocks a merge queue) — got [${triggers.join(', ')}]`)
  }
})

check('GP2 every action in the payload workflows is pinned to a full commit SHA with a tag comment', () => {
  let uses = 0
  for (const wf of WORKFLOWS) {
    for (const [i, line] of read(wf).split('\n').entries()) {
      if (!/^\s*-?\s*uses:/.test(line)) continue
      uses++
      assert.match(line, /uses:\s*\S+@[0-9a-f]{40}\s+#\s*v\S+/,
        `${wf}:${i + 1} must pin to a 40-hex commit SHA with a \`# v<tag>\` comment (a movable tag is a supply-chain hole in the gate): ${line.trim()}`)
    }
  }
  assert.ok(uses >= 2, `expected at least one \`uses:\` per payload workflow (found ${uses}) — refusing a vacuous pass`)
})

check('GP3 the ruleset payload is a POSTable dry-run-by-default branch ruleset with the four rules', () => {
  const rs = JSON.parse(read(RULESET))
  assert.equal(rs.target, 'branch', 'ruleset target must be "branch"')
  assert.equal(rs.enforcement, 'evaluate',
    'the SHIPPED ruleset must be "evaluate" (dry-run): flipping to "active" is the operator\'s deliberate act after watching it, never the default')
  assert.deepEqual(rs.conditions?.ref_name?.include, ['~DEFAULT_BRANCH'], 'the ruleset must target the default branch via the ~DEFAULT_BRANCH macro')
  const types = (rs.rules ?? []).map((r) => r.type).sort()
  assert.deepEqual(types, ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'],
    `ruleset rules must be exactly deletion + non_fast_forward + pull_request + required_status_checks — got [${types.join(', ')}]`)
  const rsc = rs.rules.find((r) => r.type === 'required_status_checks')
  assert.equal(rsc.parameters?.strict_required_status_checks_policy, true, 'required status checks must be strict (branch up to date before merge)')
  assert.ok(Array.isArray(rsc.parameters?.required_status_checks) && rsc.parameters.required_status_checks.length >= 1,
    'the ruleset must require at least one status check — that requirement IS the gate')
})

check('GP4 the required check context equals the job id both payload workflows define', () => {
  const rs = JSON.parse(read(RULESET))
  const contexts = rs.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks.map((c) => c.context)
  for (const wf of WORKFLOWS) {
    const job = read(wf).match(/^jobs:\n {2}([A-Za-z0-9_-]+):/m)
    assert.ok(job, `${wf}: could not find the first job id under jobs:`)
    assert.ok(contexts.includes(job[1]),
      `${wf} defines job "${job[1]}" but the ruleset requires [${contexts.join(', ')}] — a required check naming a job that never runs blocks nothing (or everything)`)
  }
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
