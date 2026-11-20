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
    /** Defaults to the palette's motif colour. */
    color?: string
    style?: StyleProp<ViewStyle>
}

/** The web's motif: each tile is a mask, so the ink is a token. */
export function Motif({ variant, motif = DEFAULT_ACCOUNT_SETTINGS.appearance.motif, color, style }: MotifProps) {
    const tile = TILES[motif][variant]
    return (
        <View
            importantForAccessibility="no-hide-descendants"
            style={[styles.box(variant, tile.height), style]}
        >
            <Image
                source={tile.source}
                resizeMode="repeat"
                style={styles.tile(color)}
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
    tile: (color?: string) => ({
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        tintColor: color ?? theme.colors.motifColor,
    }),
}))
