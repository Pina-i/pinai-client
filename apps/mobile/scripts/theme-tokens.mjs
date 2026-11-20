import { converter, formatHex, formatHex8, parse, toGamut } from "culori"

/** The design system's theme ids, as the domain's `ThemeId` names them. */
export const THEME_IDS = {
    "black-pearl": "pearl-dark",
    "black-pearl-light": "pearl-light",
    "lagoon": "lagoon-dark",
    "lagoon-light": "lagoon-light",
    "jungle": "jungle-dark",
    "jungle-light": "jungle-light",
    "sand": "sand-dark",
    "sand-light": "sand-light",
}

// What the design system leaves to components, as the web's `apps/web/src/index.css` sets it.
const GRAIN = {
    "pearl-dark": { opacity: 0.065, blend: "overlay" },
    "pearl-light": { opacity: 0.04, blend: "multiply" },
    "lagoon-dark": { opacity: 0.065, blend: "overlay" },
    "lagoon-light": { opacity: 0.04, blend: "multiply" },
    "jungle-dark": { opacity: 0.07, blend: "overlay" },
    "jungle-light": { opacity: 0.045, blend: "multiply" },
    "sand-dark": { opacity: 0.075, blend: "overlay" },
    "sand-light": { opacity: 0.045, blend: "multiply" },
}
// The ambient wash (`--amb`): two radial gradients, each a radius pair, a centre in % of the screen,
// and where it fades out.
const amb = (color, rx, ry, cx, cy, stop) => ({ color, rx, ry, cx, cy, stop })
const AMBIENT = {
    "pearl-dark": [amb("oklch(0.760 0.098 176 / .13)", 900, 540, 80, 2, 0.62), amb("oklch(0.705 0.075 348 / .09)", 760, 540, 4, 112, 0.58)],
    "pearl-light": [amb("oklch(0.545 0.088 176 / .11)", 900, 540, 80, 2, 0.62), amb("oklch(0.560 0.095 348 / .08)", 760, 540, 4, 112, 0.58)],
    "lagoon-dark": [amb("oklch(0.805 0.105 196 / .15)", 900, 540, 80, 2, 0.6), amb("oklch(0.715 0.178 28 / .11)", 780, 540, 4, 114, 0.58)],
    "lagoon-light": [amb("oklch(0.555 0.100 204 / .13)", 900, 540, 80, 2, 0.6), amb("oklch(0.715 0.178 28 / .10)", 780, 540, 4, 114, 0.58)],
    "jungle-dark": [amb("oklch(0.775 0.115 146 / .14)", 900, 540, 80, 2, 0.62), amb("oklch(0.700 0.085 52 / .11)", 780, 540, 4, 112, 0.58)],
    "jungle-light": [amb("oklch(0.475 0.105 148 / .12)", 900, 540, 80, 2, 0.62), amb("oklch(0.475 0.090 52 / .10)", 780, 540, 4, 112, 0.58)],
    "sand-dark": [amb("oklch(0.800 0.098 68 / .14)", 900, 540, 80, 2, 0.62), amb("oklch(0.765 0.068 186 / .10)", 780, 540, 4, 112, 0.58)],
    "sand-light": [amb("oklch(0.565 0.120 44 / .12)", 900, 540, 80, 2, 0.62), amb("oklch(0.545 0.070 186 / .10)", 780, 540, 4, 112, 0.58)],
}
const MOTIF_OPACITY = { dark: 0.02, light: 0.1 }
// The avatar tones that are no palette colour, the same in every theme (the web's `avatar-tone.ts`).
const AVATAR_TONES = {
    violet: { fill: "oklch(0.70 0.085 300)", ink: "oklch(0.18 0.02 300)" },
    olive: { fill: "oklch(0.80 0.095 110)", ink: "oklch(0.18 0.02 110)" },
    blue: { fill: "oklch(0.75 0.080 245)", ink: "oklch(0.18 0.02 245)" },
}
// Light themes lean these toward the ink for 4.5:1; dark themes use the colour itself.
const LIGHT_INKS = {
    "dnd-ink": ["dnd", 0.8],
    "idle-ink": ["idle", 0.6],
    "online-ink": ["online", 0.65],
    "muted-ink": ["muted-foreground", 0.8],
}
const DARK_MUTED_INK = 0.65

const FAMILIES = { serif: "Instrument Serif", sans: "DM Sans", mono: "Azeret Mono" }
const REM = 16

const toOklab = converter("oklab")
const intoRgb = toGamut("rgb", "oklch")

export function camel(name) {
    return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
}

/** A CSS colour (or a culori one) as hex — `#rrggbbaa` when it isn't opaque — mapped into sRGB as a browser maps it. */
export function toHex(css) {
    const color = typeof css === "string" ? parse(css) : css
    if (!color) throw new Error(`Not a colour: ${css}`)
    const rgb = intoRgb(color)
    return rgb.alpha === undefined || rgb.alpha >= 1 ? formatHex(rgb) : formatHex8(rgb)
}

/** `color-mix(in oklab, a weight%, b)`, for opaque colours. */
export function mixOklab(a, b, weight) {
    const x = toOklab(parse(a))
    const y = toOklab(parse(b))
    return toHex({
        mode: "oklab",
        l: x.l * weight + y.l * (1 - weight),
        a: x.a * weight + y.a * (1 - weight),
        b: x.b * weight + y.b * (1 - weight),
    })
}

/** Every colour token of one design-system theme, references resolved, as CSS. */
export function resolveColors(tokens, dsTheme) {
    const raw = Object.fromEntries(
        tokens.color.tokens.map((t) => [t.name, typeof t.value === "string" ? t.value : t.value[dsTheme]]),
    )
    const resolve = (name, seen = new Set()) => {
        const value = raw[name]
        if (value === undefined) throw new Error(`${dsTheme}: no token ${name}`)
        const ref = /^\{(.+)\}$/.exec(value)
        if (!ref) return value
        if (seen.has(name)) throw new Error(`${dsTheme}: ${name} refers to itself`)
        return resolve(ref[1], new Set(seen).add(name))
    }
    return Object.fromEntries(Object.keys(raw).map((name) => [name, resolve(name)]))
}

function themeColors(tokens, dsTheme, mode) {
    const css = resolveColors(tokens, dsTheme)
    const colors = Object.fromEntries(Object.entries(css).map(([name, value]) => [camel(name), toHex(value)]))
    colors.card = colors.surface1
    colors.popover = mixOklab(css.background, css.foreground, 0.93)
    for (const [name, [base, weight]] of Object.entries(LIGHT_INKS)) {
        colors[camel(name)] = mode === "light" ? mixOklab(css[base], css.foreground, weight) : toHex(css[base])
    }
    if (mode === "dark") colors.mutedInk = mixOklab(css["muted-foreground"], css.foreground, DARK_MUTED_INK)
    return colors
}

function px(value, fontSize) {
    if (value === undefined) return undefined
    if (value.endsWith("px")) return Number.parseFloat(value)
    if (value.endsWith("rem")) return Number.parseFloat(value) * REM
    if (value.endsWith("em")) return Math.round(Number.parseFloat(value) * fontSize * 100) / 100
    throw new Error(`Not a length: ${value}`)
}

/** The type scale, React Native's way: absolute line heights and letter spacing. */
export function typeScale(tokens) {
    const scale = {}
    for (const group of tokens.type.groups) {
        for (const style of group.styles) {
            const fontSize = px(style.fontSize)
            scale[camel(style.name.replace(/^text-/, ""))] = {
                fontFamily: FAMILIES[group.family],
                fontSize,
                fontWeight: String(style.fontWeight ?? 400),
                ...(style.lineHeight !== undefined && { lineHeight: Math.round(fontSize * style.lineHeight * 100) / 100 }),
                ...(style.letterSpacing !== undefined && { letterSpacing: px(style.letterSpacing, fontSize) }),
            }
        }
    }
    return scale
}

export function lengths(section) {
    return Object.fromEntries(section.tokens.map((t) => [camel(t.name), px(t.value)]))
}

/** Everything the app's themes take from the design system. */
export function buildThemes(tokens) {
    const themes = {}
    for (const theme of tokens.color.themes) {
        const id = THEME_IDS[theme.id]
        if (!id) throw new Error(`No ThemeId for the design system's ${theme.id}`)
        const mode = id.endsWith("-light") ? "light" : "dark"
        themes[id] = {
            colors: themeColors(tokens, theme.id, mode),
            grain: GRAIN[id],
            // SVG gradient stops take their alpha apart (`stopOpacity`), never inside the colour.
            ambient: AMBIENT[id].map(({ color, ...shape }) => ({
                ...shape,
                color: toHex(color).slice(0, 7),
                opacity: parse(color).alpha ?? 1,
            })),
            motifOpacity: MOTIF_OPACITY[mode],
        }
    }
    return {
        themes,
        type: typeScale(tokens),
        avatarTones: Object.fromEntries(
            Object.entries(AVATAR_TONES).map(([tone, { fill, ink }]) => [tone, { fill: toHex(fill), ink: toHex(ink) }]),
        ),
        radius: lengths(tokens.radius),
        space: lengths(tokens.spacing),
        layout: Object.fromEntries(
            tokens.layout.tokens.filter((t) => /px$/.test(t.value)).map((t) => [camel(t.name), px(t.value)]),
        ),
    }
}
