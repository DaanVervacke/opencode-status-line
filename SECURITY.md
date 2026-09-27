# Security policy

## Supported versions

The latest published version is the supported one; fixes ship as a new patch
release on npm.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
— [Report a vulnerability][advisory] — or email
[bib.nexus@gmail.com](mailto:bib.nexus@gmail.com) if you cannot use GitHub.
Include what you found, how to reproduce it, and the plugin version.

You will get an acknowledgement as soon as possible (usually within a few
days). If the report is valid, a fix ships as a patch release and the advisory
is published with credit unless you prefer otherwise.

## Scope

The plugin runs inside OpenCode's TUI process. It reads its own configuration
files and the host's session and VCS state; it opens no network connections and
spawns no processes. Vulnerabilities in OpenCode itself belong in the
[OpenCode repository](https://github.com/sst/opencode).

[advisory]: https://github.com/rashidrazak/opencode-status-line/security/advisories/new
