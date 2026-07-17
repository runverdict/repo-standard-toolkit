# Configuration

`.repo-standard.json`, operator-owned, reconciled (never regenerated) on re-runs. A missing
file still runs the full hardcoded canon, with default scope (no counts, no extra sections);
the scaffolder ships a stricter starting config. Keys starting with `//` are comments. Unknown
keys are hard errors — nothing is silently ignored.

The canon-versus-scope split is the whole design: the standard itself (the six Keep a
Changelog categories, License-last, the voice ban) lives in the lint and cannot be configured
away. The config selects which docs are governed, which numeric claims are machine-checked,
and which extra rules apply — it can only ever add, except through the one loud off switch
described below.

## The interesting surface

```json
{
  "version": 1,
  "manifest": { "file": "COPY-MANIFEST.md", "statuses": ["UNCHANGED", "MODIFIED", "NEW"] },
  "readme": { "requireSections": ["usage", "caveat|limitation"] },
  "conventions": { "minSections": 7 },
  "voice": { "extraBanned": ["frictionless"], "properNouns": ["Seamless Deploy"] },
  "counts": {
    "standing-tests": {
      "pattern": "(\\d[\\d,]*)\\s+standing tests",
      "glob": "acceptance/test-*.mjs",
      "minMentions": 2
    }
  },
  "checks": { "lockstep": { "enabled": false, "why": "printed loudly on every run" } }
}
```

## Counts — the anti-drift core

A numeric claim in prose is bound to a derivable fact (a file glob, a line-regex count over a
source file) and to every other doc stating it — a forgotten update reddens the build instead
of shipping a lie. Each count declares a `pattern` whose first capture group is the number,
plus a source of truth: `glob` (literal directories, `*` only in the basename — deliberately
tiny so the enforcement stays auditable), or `file` + `lineRegex`, or neither for
cross-doc-agreement-only numbers. `minMentions` requires the claim to appear at least N times;
`docs` restricts which docs are scanned; `under` scopes the scan to one heading's region — so
a historical number inside a dated CHANGELOG release block stays history instead of failing
forever once the live count moves on.

## The off switch, and why it is loud

A check can be disabled only as `{ "enabled": false, "why": "<reason>" }`, and the reason
prints on every run. A bare `false` is a config error. `properNouns` voice exemptions print on
every run too. Nothing in this file can be silently weakened — visibility is the price of
every exception.

## Recorded provenance

A `scaffold` block — written by the skill, never by hand — records which plugin version
produced the repo's governance and the operator's confirmed answers. A re-run pre-fills its
questions from it and re-asks only what is missing, and the repo itself can answer which
standard version governs it, with the plugin gone. The lint validates the block's shape and
never varies enforcement by it.
