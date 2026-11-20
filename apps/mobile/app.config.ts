import type { ExpoConfig } from "expo/config"

const config: ExpoConfig = {
    name: "Pīna'i",
    slug: "pinai",
    version: "0.0.0",
    orientation: "portrait",
    platforms: ["android", "ios"],
    // The sign-in comes back to `io.github.pina-i:/callback`, the scheme every IdP's mobile
    // document lists (the desktop's too: the Pina-i organisation's GitHub Pages domain, reversed).
    scheme: "io.github.pina-i",
    userInterfaceStyle: "automatic",
    android: {
        // Android refuses `-` in an application id.
        package: "io.github.pina_i.mobile",
        predictiveBackGestureEnabled: false,
    },
    ios: {
        bundleIdentifier: "io.github.pina-i.mobile",
    },
    plugins: ["expo-router"],
    experiments: {
        typedRoutes: true,
        reactCompiler: true,
    },
}

export default config
