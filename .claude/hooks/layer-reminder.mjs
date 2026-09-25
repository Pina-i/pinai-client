// PreToolUse hook: before an edit to a zustand slice or a viewmodel — where
// rules tend to leak — remind Claude which layer owns what. Never blocks; any
// other file, or a payload it can't read, gets silence.
import { stdin, stdout } from "node:process"

const REMINDER = {
    slice: "a zustand slice (UI state: get/set only)",
    viewmodel: "a viewmodel (screen state and handlers only)",
}

let raw = ""
for await (const chunk of stdin) raw += chunk

let filePath = ""
try {
    filePath = String(JSON.parse(raw).tool_input?.file_path ?? "").replaceAll("\\", "/")
} catch {
    process.exit(0)
}

const kind = /\/apps\/[^/]+\/src\/store\/slices\//.test(filePath)
    ? "slice"
    : /\.viewmodel\.tsx?$/.test(filePath)
      ? "viewmodel"
      : null
if (!kind) process.exit(0)

stdout.write(
    JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            additionalContext:
                `Layer check — you are editing ${REMINDER[kind]}. ` +
                "A rule about data (ordering, dedupe, folding, reconciliation, validation, expiry) " +
                "does not belong here: it is a pure function in packages/domain/src/models with a spec " +
                "in apps/web/test, and this file only calls it (a slice may call it inside `set`). " +
                "Existing code here is not a precedent. See \"Where does a change go?\" in the root CLAUDE.md. " +
                "If this edit adds such a rule, stop and put it in the owning layer, and say which layer you chose.",
        },
    }),
)
