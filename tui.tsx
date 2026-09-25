/**
 * Local-directory entrypoint. OpenCode's directory plugin resolution looks for
 * `<plugin-dir>/tui` before consulting `package.json` exports (the 2.0.16
 * loader), so this shim keeps the checkout loadable from `cli.json`. npm
 * consumers and newer loaders resolve `opencode-status-line/tui` through the
 * exports map straight to `./src/tui.tsx`. Do not delete as redundant.
 */
export { default } from "./src/tui.tsx"
