#!/usr/bin/env node
/**
 * Prints the CHANGELOG.md section for one version, for use as the GitHub
 * Release body: `node scripts/changelog-section.mjs v1.2.3` (the leading `v`
 * is optional). Exits non-zero when the version has no section, or when the
 * section is empty, so a release never ships without its notes.
 *
 * The section runs from its `## [x.y.z]` heading to the next version heading
 * or to the link definitions (`[Unreleased]: …`) that Keep a Changelog keeps
 * at the foot of the file. Node built-ins only; the release workflow runs it
 * before anything is published.
 */
import { readFileSync } from "node:fs"

const version = (process.argv[2] ?? "").replace(/^v/, "")
if (version === "") {
  console.error("usage: node scripts/changelog-section.mjs <version>")
  process.exit(2)
}

const lines = readFileSync("CHANGELOG.md", "utf8").split("\n")
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const heading = new RegExp(`^## \\[${escaped}\\]`)
const start = lines.findIndex((line) => heading.test(line))
if (start === -1) {
  console.error(`changelog-section: CHANGELOG.md has no "## [${version}]" section`)
  process.exit(1)
}

const stop = /^## |^\[[^\]]+\]:\s/
let end = lines.findIndex((line, index) => index > start && stop.test(line))
if (end === -1) end = lines.length

const body = lines.slice(start + 1, end).join("\n").trim()
if (body === "") {
  console.error(`changelog-section: the "## [${version}]" section is empty`)
  process.exit(1)
}

process.stdout.write(body + "\n")
