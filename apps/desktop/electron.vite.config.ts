import path from "path"
import { defineConfig } from "electron-vite"
import { loadConfigFromFile, mergeConfig } from "vite"

const webRoot = path.resolve(import.meta.dirname, "../web")

export default defineConfig(async (env) => {
    // Loaded through Vite rather than imported: electron-vite's config bundler would resolve
    // the web plugins from apps/desktop, where pnpm does not link them.
    const web = await loadConfigFromFile(env, path.join(webRoot, "vite.config.ts"), webRoot)
    if (!web) throw new Error(`No Vite config found in ${webRoot}`)

    return {
        // The workspace packages are TypeScript sources: bundled, not loaded from node_modules.
        main: { build: { externalizeDeps: { exclude: ["@pinai/api", "@pinai/domain"] } } },
        // Sandboxed preloads run as classic scripts: no ES modules.
        preload: { build: { rolldownOptions: { output: { format: "cjs" as const, entryFileNames: "[name].cjs" } } } },
        renderer: mergeConfig(web.config, {
            root: webRoot,
            envDir: webRoot,
            build: { rolldownOptions: { input: path.join(webRoot, "index.html") } },
            // The renderer is the web app, built knowing it runs inside the desktop app.
            define: { "import.meta.env.PINAI_DESKTOP": "true" },
        }),
    }
})
