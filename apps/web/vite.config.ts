import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { readFileSync } from "fs"
import path from "path"
import { defineConfig, loadEnv, type Plugin } from "vite"

const DOCUMENT_PATH = "/oauth-client.json"

function clientDocument(origin: string): string {
    return JSON.stringify({
        client_id: `${origin}${DOCUMENT_PATH}`,
        client_name: "Pīna'i",
        application_type: "web",
        redirect_uris: [`${origin}/callback`],
        post_logout_redirect_uris: [`${origin}/`],
        token_endpoint_auth_method: "none",
    })
}

// Identity providers know this client only by this document, and its URLs must be the
// deployment's own: the dev server answers for the host it is reached on, a build needs PUBLIC_ORIGIN.
function oauthClientDocument(): Plugin {
    let origin: string | undefined
    return {
        name: "pinai:oauth-client-document",
        configResolved(config) {
            origin = loadEnv(config.mode, config.envDir || config.root, "PUBLIC_ORIGIN").PUBLIC_ORIGIN
        },
        configureServer(server) {
            const scheme = server.config.server.https ? "https" : "http"
            server.middlewares.use(DOCUMENT_PATH, (request, response) => {
                response.setHeader("Content-Type", "application/json")
                response.end(clientDocument(`${scheme}://${request.headers.host}`))
            })
        },
        generateBundle() {
            if (origin === undefined || !URL.canParse(origin) || new URL(origin).origin !== origin) {
                this.error(
                    "PUBLIC_ORIGIN must be the origin this build is served from, e.g. https://app.example — see .env.example",
                )
            }
            this.emitFile({ type: "asset", fileName: DOCUMENT_PATH.slice(1), source: clientDocument(origin) })
        },
    }
}

// The landing offers the desktop app at its own version.
const desktopPackage = JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "../desktop/package.json"), "utf8"),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
    define: {
        "import.meta.env.PINAI_DESKTOP_VERSION": JSON.stringify(desktopPackage.version),
    },
    plugins: [
        tanstackRouter({ target: "react", autoCodeSplitting: true }),
        react(),
        tailwindcss(),
        oauthClientDocument(),
    ],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
        },
    },
    server: {
        port: 5173,
        strictPort: true,
    },
})
