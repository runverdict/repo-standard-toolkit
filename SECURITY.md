# Security Policy

## What this project is (and what this policy covers)

This is a Claude Code plugin that scaffolds repo-hygiene artifacts and installs a committed,
dependency-free lint plus a CI workflow into target repositories. It processes no user data and
runs no service. Its security surface is what it **writes into other repos**: the payload lint,
the CI workflow, the templates, and the harness engines that generate them.

In scope for this policy — vulnerabilities in the toolkit itself, for example: a payload or
template that would execute unexpected code in a target repo's CI, a harness engine that writes
outside the paths it declares or follows a hostile path out of the target directory, a code path
that silently overwrites operator content the design says must be refused, or an injection route
from a sensed repo's content into what the scaffolder writes.

## Reporting a vulnerability

Please report privately — do **not** open a public issue for a security report.

- **Preferred:** email `dev@runverdict.com`.
- **Collaborators:** GitHub **private vulnerability reporting** — the *Security* tab of
  [`runverdict/repo-standard-toolkit`](https://github.com/runverdict/repo-standard-toolkit)
  → *Report a vulnerability*.

Include the affected file/engine, a minimal reproduction (the engines are pure and
dependency-free, so a short `node harness/<engine>.mjs …` invocation or a failing
`acceptance/test-*.mjs` case is ideal), the impact, and any fix you have in mind.

## What to expect

- **Acknowledgement within 3 business days.**
- An assessment and, for a confirmed issue, a remediation plan within **10 business days** —
  and, where the property is determinizable, a new standing `acceptance/test-*.mjs` that fails
  the build if the issue ever recurs.
- Credit in the release notes if you would like it; coordinated disclosure once a fix has landed.

This is a community project maintained on a best-effort basis; these are targets, not a
contractual SLA.

## Out of scope

- The hygiene of a repo the plugin was **not** run against, and drift a target repo introduces
  after removing or editing the installed lint — the enforcement is theirs once installed.
- The behavior of the Claude model driving the skill. The design assumes the agent can err,
  which is why everything that must hold is enforced by the committed lint in CI, not by the
  agent.

## Supported versions

The plugin ships from `main`; fixes land there and go out in the next version bump. There is no
back-port of security fixes to older tags — update to the latest `main` / release.
