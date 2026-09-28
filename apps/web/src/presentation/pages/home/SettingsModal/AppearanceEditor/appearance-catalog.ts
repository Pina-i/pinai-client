import type { MotifKey, ThemeFamily, ThemeId } from "@pinai/domain/models/user-settings"

export const FAMILY_LABELS: Record<ThemeFamily, string> = {
    pearl: "Black Pearl",
    lagoon: "Lagoon",
    jungle: "Jungle",
    sand: "Sand",
}

/** Ground, accent, third colour — the three chips a palette is described by. */
export const THEME_SWATCHES: Record<ThemeId, readonly [string, string, string]> = {
    "pearl-dark": ["oklch(0.145 0.014 196)", "oklch(0.760 0.098 176)", "oklch(0.705 0.075 348)"],
    "pearl-light": ["oklch(0.971 0.006 192)", "oklch(0.545 0.088 176)", "oklch(0.560 0.095 348)"],
    "lagoon-dark": ["oklch(0.162 0.042 248)", "oklch(0.805 0.105 196)", "oklch(0.715 0.178 28)"],
    "lagoon-light": ["oklch(0.973 0.014 228)", "oklch(0.555 0.100 204)", "oklch(0.572 0.162 28)"],
    "jungle-dark": ["oklch(0.158 0.026 152)", "oklch(0.775 0.115 146)", "oklch(0.700 0.085 52)"],
    "jungle-light": ["oklch(0.960 0.018 140)", "oklch(0.475 0.105 148)", "oklch(0.475 0.090 52)"],
    "sand-dark": ["oklch(0.176 0.014 74)", "oklch(0.800 0.098 68)", "oklch(0.765 0.068 186)"],
    "sand-light": ["oklch(0.947 0.026 84)", "oklch(0.565 0.120 44)", "oklch(0.545 0.070 186)"],
}

export const MOTIF_LABELS: Record<MotifKey, { label: string; gloss: string }> = {
    kowhaiwhai: { label: "Kōwhaiwhai", gloss: "unfurling fronds" },
    raranga: { label: "Raranga", gloss: "plaiting" },
    puhoro: { label: "Puhoro", gloss: "rafter band" },
    tapa1: { label: "Tapa 1", gloss: "teeth" },
    tapa2: { label: "Tapa 2", gloss: "hatched zigzag" },
    tapa3: { label: "Tapa 3", gloss: "plaited diagonals" },
    tapa4: { label: "Tapa 4", gloss: "nested arrows" },
}
