import { useWindowDimensions } from "react-native"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"
import { StyleSheet, useUnistyles } from "react-native-unistyles"

/** The web's ambient wash: the palette's two accents glowing from opposite corners. */
export function Backdrop() {
    const { theme } = useUnistyles()
    const { width, height } = useWindowDimensions()

    return (
        <Svg
            width={width}
            height={height}
            style={styles.layer}
            importantForAccessibility="no-hide-descendants"
        >
            <Defs>
                {theme.ambient.map((gradient, i) => (
                    <RadialGradient
                        key={i}
                        id={`ambient-${i}`}
                        gradientUnits="userSpaceOnUse"
                        cx={(gradient.cx / 100) * width}
                        cy={(gradient.cy / 100) * height}
                        rx={gradient.rx}
                        ry={gradient.ry}
                    >
                        <Stop
                            offset={0}
                            stopColor={gradient.color}
                            stopOpacity={gradient.opacity}
                        />
                        <Stop
                            offset={gradient.stop}
                            stopColor={gradient.color}
                            stopOpacity={0}
                        />
                    </RadialGradient>
                ))}
            </Defs>
            {theme.ambient.map((_, i) => (
                <Rect
                    key={i}
                    width={width}
                    height={height}
                    fill={`url(#ambient-${i})`}
                />
            ))}
        </Svg>
    )
}

const styles = StyleSheet.create({
    layer: {
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
    },
})
