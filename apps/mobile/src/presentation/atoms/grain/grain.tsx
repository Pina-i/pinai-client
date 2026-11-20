import { Image } from "expo-image"
import { useWindowDimensions, View } from "react-native"
import { StyleSheet } from "react-native-unistyles"
import grain from "@/assets/grain.gif"
import { useReduceMotion } from "@/presentation/hooks/use-reduce-motion"

// The web's film grain: a 3-frame GIF tiled at 1:1, so the noise drifts; still under reduced motion.
const TILE = { width: 480, height: 360 }

/** Over the whole screen, above everything, touching nothing. */
export function Grain() {
    const { width, height } = useWindowDimensions()
    const reduceMotion = useReduceMotion()
    const columns = Math.ceil(width / TILE.width)
    const rows = Math.ceil(height / TILE.height)

    return (
        <View
            importantForAccessibility="no-hide-descendants"
            style={styles.layer}
        >
            {Array.from({ length: rows * columns }, (_, i) => (
                <Image
                    key={i}
                    source={grain}
                    autoplay={!reduceMotion}
                    style={[styles.tile, { left: (i % columns) * TILE.width, top: Math.floor(i / columns) * TILE.height }]}
                />
            ))}
        </View>
    )
}

const styles = StyleSheet.create((theme) => ({
    layer: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        pointerEvents: "none",
        opacity: theme.grain.opacity,
        mixBlendMode: theme.grain.blend,
    },
    tile: {
        position: "absolute",
        width: TILE.width,
        height: TILE.height,
    },
}))
