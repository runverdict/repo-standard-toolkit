# Security Policy

## Scope

This policy covers vulnerabilities in **{{PROJECT_NAME}}** itself — its source, its build and
release artifacts, and anything this repository ships.

<!-- TODO(scaffold): state what this project is NOT responsible for (downstream apps, audited
targets, third-party services) so reporters can triage before writing in. -->

## Reporting a vulnerability

Please report privately — do **not** open a public issue for a security report.

- **Preferred:** email **{{SECURITY_CONTACT}}**.
<!-- TODO(scaffold): if this repo has a GitHub remote, add a second bullet pointing at private
vulnerability reporting via the repo's *Security* tab, with the REAL owner/repo link derived
from `git remote get-url origin` — never a guessed one. If the repo has no remote, delete this
comment; the email channel above stands alone. -->

Include the affected file or component, a minimal reproduction, the impact as you understand it,
and any fix you have in mind.

## What to expect

<!-- TODO(scaffold): response-time targets are a COMMITMENT the maintainer must choose — ask,
never assume, and delete any line they decline. A common starting point: acknowledgement within
3 business days; an assessment and, for a confirmed issue, a remediation plan within 10 business
days. -->

- Credit in the release notes if you would like it; coordinated disclosure once a fix has landed.

This project is maintained on a best-effort basis; any targets above are targets, not a
contractual SLA.

## Supported versions

Fixes land on `{{DEFAULT_BRANCH}}` and go out in the next release. There is no back-port of
security fixes to older versions — update to the latest release.
