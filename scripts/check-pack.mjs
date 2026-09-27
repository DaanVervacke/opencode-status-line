#!/usr/bin/env node
/**
 * Checks the npm tarball before it ships. `src/tui.tsx` imports its modules by
 * relative path and OpenCode transpiles them straight from the installed
 * tarball, so a source file missing from `files` is a broken install that no
 * unit test can catch. `npm run check:pack` runs this on every pull request
 * (and before every publish, through `prepublishOnly`).
 *
 * The rules, in both directions:
 *   - every file tracked under `src/` must be packed;
 *   - nothing under `src/` may be packed that git does not track;
 *   - the root `tui.tsx` shim must stay out — npm consumers resolve the entry
 *     through the `exports` map, and the shim would shadow it at the root of
 *     the installed package;
 *   - every target of the `exports` map must exist in the tarball.
 *
 * Node built-ins only: `npm pack --dry-run --json` and `git ls-files`.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })

const pkg = JSON.parse(readFileSync("package.json", "utf8"))
const packedReport = JSON.parse(run("npm", ["pack", "--dry-run", "--json"]))
// npm 12 returns an object keyed by package name; npm 11 and older an array.
const report = Array.isArray(packedReport) ? packedReport[0] : Object.values(packedReport)[0]
const packed = new Set(report.files.map((file) => file.path))

const tracked = new Set(
  run("git", ["ls-files", "--", "src"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
)

const problems = []

for (const file of tracked) {
  if (!packed.has(file)) {
    problems.push(`${file} is tracked but not in the tarball — src/tui.tsx imports it at runtime`)
  }
}
for (const file of packed) {
  if (file.startsWith("src/") && !tracked.has(file)) {
    problems.push(`${file} is in the tarball but untracked — stray files under src/ ship to consumers`)
  }
}
if (packed.has("tui.tsx")) {
  problems.push("the root tui.tsx shim is in the tarball — npm consumers must resolve src/tui.tsx through the exports map")
}
for (const file of ["package.json", "README.md", "LICENSE"]) {
  if (!packed.has(file)) problems.push(`${file} is missing from the tarball`)
}

const exportTargets = []
const collectTargets = (value) => {
  if (typeof value === "string") exportTargets.push(value)
  else if (value && typeof value === "object") for (const nested of Object.values(value)) collectTargets(nested)
}
for (const value of Object.values(pkg.exports ?? {})) collectTargets(value)
for (const target of exportTargets) {
  const path = target.replace(/^\.\//, "")
  if (!packed.has(path)) problems.push(`exports points at ${path}, which is not in the tarball`)
}

if (problems.length > 0) {
  console.error(`check-pack: ${problems.length} problem(s) with the tarball:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

const kb = Math.max(1, Math.round(report.unpackedSize / 1024))
console.log(`check-pack: tarball is complete — ${report.entryCount} files, ${kb} KB unpacked (${report.filename})`)
