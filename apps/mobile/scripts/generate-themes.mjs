import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { buildThemes } from "./theme-tokens.mjs"

const root = fileURLToPath(new URL("..", import.meta.url))
const tokens = JSON.parse(readFileSync(`${root}design-system/tokens.json`, "utf8"))
const { themes, type, radius, space, layout, avatarTones } = buildThemes(tokens)

const json = (value) => JSON.stringify(value, null, 4)

writeFileSync(
    `${root}src/theme/themes.generated.ts`,
    `// Generated from design-system/tokens.json by \`pnpm themes\`: edit those, not this.
import type { ThemeId } from "@pinai/domain/models/user-settings"

export const themes = ${json(themes)} as const satisfies Record<ThemeId, unknown>

export const type = ${json(type)} as const

export const radius = ${json(radius)} as const

export const space = ${json(space)} as const

export const layout = ${json(layout)} as const

export const avatarTones = ${json(avatarTones)} as const
`,
)
