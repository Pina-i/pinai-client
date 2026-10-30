import path from "path"
import { defineConfig } from "electron-vite"
import { loadConfigFromFile, mergeConfig, type PluginOption } from "vite"

const webRoot = path.resolve(import.meta.dirname, "../web")

// The web deployment's /oauth-client.json: the desktop app's client is each IdP's own document.
const isClientDocument = (plugin: PluginOption) =>
    !!plugin && typeof plugin === "object" && "name" in plugin && plugin.name === "pinai:oauth-client-document"

export default defineConfig(async (env) => {
    // Loaded through Vite rather than imported: electron-vite's config bundler would resolve
    // the web plugins from apps/desktop, where pnpm does not link them.
    const web = await loadConfigFromFile(env, path.join(webRoot, "vite.config.ts"), webRoot)
    if (!web) throw new Error(`No Vite config found in ${webRoot}`)
    const webPlugins = web.config.plugins ?? []
    const plugins = webPlugins.filter((plugin) => !isClientDocument(plugin))
    // Renamed in apps/web, it would stay in: the build would fail without PUBLIC_ORIGIN, ship the document with one.
    if (plugins.length !== webPlugins.length - 1) {
        throw new Error("The web's pinai:oauth-client-document plugin wasn't found: rename it here too")
    }
    const webApp = { ...web.config, plugins }

    return {
        // Every package is a devDependency, so bundled: the packaged app ships out/ alone.
        main: {},
        // Sandboxed preloads run as classic scripts: no ES modules.
        preload: { build: { rolldownOptions: { output: { format: "cjs" as const, entryFileNames: "[name].cjs" } } } },
        renderer: mergeConfig(webApp, {
            root: webRoot,
            envDir: webRoot,
            // electron-vite's preset leaves the renderer unminified.
            build: { minify: true, rolldownOptions: { input: path.join(webRoot, "index.html") } },
            // The renderer is the web app, built knowing it runs inside the desktop app.
            define: { "import.meta.env.PINAI_DESKTOP": "true" },
            // electron-vite's production preset forces base "./", meant for file://. app:// answers
            // index.html at every route, so from /dm/alice, "./assets/…" would be index.html again.
            plugins: [{ name: "pinai:root-base", apply: "build", config: () => ({ base: "/" }) }],
        }),
    }
})
