# Security policy

## Supported versions

Only the latest published version receives fixes; each fix ships as a new patch
release on npm. OpenCode caches the installed plugin by version and reuses that
copy on startup, so an older version keeps running until it is removed:

```sh
rm -rf ~/.cache/opencode/packages/opencode-status-line*
```

Then restart OpenCode.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

## Reporting a vulnerability

Please do not open a public issue. Report privately through GitHub's
[Report a vulnerability][advisory] form, or email
[bib.nexus@gmail.com](mailto:bib.nexus@gmail.com) if you cannot use GitHub.
Include:

- the affected version, and whether it came from npm or a checkout;
- the impact, and how it can be triggered;
- reproduction steps, as small as you can make them;
- a suggested fix, if you have one.

Do not paste live credentials, session content, or config files containing
personal paths into a report; a redacted placeholder is enough to identify what
is involved. If neither channel works, open an issue that only asks for a
private channel — with no details in it.

There is no bug bounty: this is a volunteer project, reports are handled on a
best-effort basis, and you will get an acknowledgement when yours is triaged.
If the report is valid, the advisory is published with credit unless you prefer
otherwise.

## Scope

The plugin runs inside OpenCode's TUI process. It reads its own configuration
files and the host's session and VCS state. It opens no network connections,
spawns no processes and writes no files of its own; it does not read provider
credentials, and session content is neither stored nor sent anywhere.

In scope:

- configuration loading and its path/JSON handling (`src/config.ts`);
- the entry and its event wiring (`src/tui.tsx`) and the rendering maths
  (`src/render.ts`);
- the VCS/diff reading (`src/diff.ts`);
- the release pipeline (`.github/workflows/`, `scripts/`).

Out of scope — report these where they belong instead:

- OpenCode itself, its plugin loader, or terminal and theme behaviour (the
  [OpenCode repository](https://github.com/sst/opencode));
- vulnerabilities in third-party dependencies, unless you can show they are
  reachable through this plugin;
- configuration mistakes and support questions (open a regular issue).

[advisory]: https://github.com/rashidrazak/opencode-status-line/security/advisories/new
