#!/usr/bin/env node
/*
 * fill-template.mjs — deterministic placeholder fill for the payload templates.
 *
 * The scaffolder's mechanical half: substituting `{{KEY}}` placeholders is determinizable, so it
 * lives in an engine, not in agent prose — the agent chooses the VALUES, this engine guarantees
 * the fill is total and typo-proof. Fails loud, never silent:
 *   - a placeholder left unfilled is exit 2 (a template can never ship half-scaffolded),
 *   - a --set key the template does not use is exit 2 (a typo can never be dropped on the floor),
 *   - an existing --out is refused without --force (the scaffolder never clobbers by accident).
 *
 * Usage:
 *   node harness/fill-template.mjs --template <path> --set KEY=VALUE [--set ...] \
 *     (--out <path> [--force] | --stdout)
 *
 * Placeholders are `{{KEY}}`, KEY in [A-Z0-9_]+. Values are inserted verbatim (no escaping — the
 * templates are markdown/text). Output is byte-deterministic for a given template + value set.
 * Dependency-free: Node built-ins only. Exit 0 written/printed · 2 refused (nothing written).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const PLACEHOLDER = /\{\{([A-Z0-9_]+)\}\}/g

const fail = (msg) => { console.error(`fill-template: ${msg}`); process.exit(2) }

// ---- argv (no deps, order-free) ----
const args = process.argv.slice(2)
let template = null, out = null, stdout = false, force = false
const values = {}
// a value-taking flag must never swallow the NEXT FLAG as its value: `--out --force` is a
// dropped path (a plausible typo), and writing a file literally named "--force" and exiting 0
// would break this engine's one promise — fail loud, never silent.
const take = (flag, i) => {
  const v = args[i]
  if (v === undefined || v.startsWith('--')) fail(`${flag} expects a value, got "${v ?? '<end of arguments>'}"`)
  return v
}
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--template') template = take('--template', ++i)
  else if (a === '--out') out = take('--out', ++i)
  else if (a === '--stdout') stdout = true
  else if (a === '--force') force = true
  else if (a === '--set') {
    const kv = take('--set', ++i)
    const eq = kv.indexOf('=')
    if (eq < 1) fail(`--set expects KEY=VALUE, got "${kv}"`)
    const key = kv.slice(0, eq)
    if (!/^[A-Z0-9_]+$/.test(key)) fail(`--set key "${key}" must be [A-Z0-9_]+ (the placeholder alphabet)`)
    if (key in values) fail(`--set "${key}" given twice — ambiguous, refusing`)
    values[key] = kv.slice(eq + 1)
  } else fail(`unknown argument "${a}"`)
}
if (!template) fail('--template is required')
if (!out && !stdout) fail('one of --out or --stdout is required')
if (out && stdout) fail('--out and --stdout are mutually exclusive')
if (!existsSync(template)) fail(`template not found: ${template}`)

const src = readFileSync(template, 'utf8')
const needed = new Set([...src.matchAll(PLACEHOLDER)].map((m) => m[1]))

// total fill or nothing: every placeholder needs a value, every value needs a placeholder.
const missing = [...needed].filter((k) => !(k in values)).sort()
if (missing.length) fail(`unfilled placeholder(s) in ${template}: ${missing.join(', ')} — pass --set for each`)
const unused = Object.keys(values).filter((k) => !needed.has(k)).sort()
if (unused.length) fail(`--set key(s) not present in ${template}: ${unused.join(', ')} — typo, or wrong template`)

const filled = src.replace(PLACEHOLDER, (_, k) => values[k])

if (stdout) {
  process.stdout.write(filled)
} else {
  if (existsSync(out) && !force) fail(`refusing to overwrite existing ${out} (pass --force only after reviewing what is there)`)
  // an I/O failure lands on the documented refusal path (exit 2 + a message), never as a raw
  // stack trace on exit 1 — a caller branching on the exit code must see the contract hold.
  try {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, filled)
  } catch (e) {
    fail(`cannot write ${out}: ${e.message}`)
  }
  console.log(`fill-template: wrote ${out} (${needed.size} placeholder${needed.size === 1 ? '' : 's'} filled)`)
}
