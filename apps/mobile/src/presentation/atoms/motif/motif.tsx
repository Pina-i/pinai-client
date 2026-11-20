import { DEFAULT_ACCOUNT_SETTINGS, type MotifKey } from "@pinai/domain/models/user-settings"
import { Image, type StyleProp, View, type ViewStyle } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import { TILES } from "./tiles.generated"

// The design system's `--motif-band-opacity`; a field takes the theme's.
const BAND_OPACITY = 0.55

interface MotifProps {
    /** `field` tiles a surface; `band` is a rule, one tile high. */
    variant: "field" | "band"
    motif?: MotifKey
    /** A band's height in dp, its tile scaled to it. Defaults to the motif's own. */
    size?: number
    /** Defaults to the palette's motif colour. */
    color?: string
    style?: StyleProp<ViewStyle>
}

/** The web's motif: each tile is a mask, so the ink is a token. */
export function Motif({ variant, motif = DEFAULT_ACCOUNT_SETTINGS.appearance.motif, size, color, style }: MotifProps) {
    const tile = TILES[motif][variant]
    const scale = variant === "band" && size ? size / tile.height : 1
    return (
        <View
            importantForAccessibility="no-hide-descendants"
            style={[styles.box(variant, tile.height * scale), style]}
        >
            <Image
                source={tile.source}
                resizeMode="repeat"
                style={styles.tile(scale, color)}
            />
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    box: (variant: "field" | "band", height: number) => ({
        overflow: "hidden",
        pointerEvents: "none",
        opacity: variant === "band" ? BAND_OPACITY : theme.motifOpacity,
        ...(variant === "band" && { height }),
    }),
    // A repeated image tiles at its own size, so a smaller band shrinks a wider strip of tiles.
    tile: (scale: number, color?: string) => ({
        position: "absolute",
        top: 0,
        left: 0,
        width: `${100 / scale}%`,
        height: `${100 / scale}%`,
        transformOrigin: "top left",
        transform: [{ scale }],
        tintColor: color ?? theme.colors.motifColor,
    }),
}))
