// Linux, development only: registers this checkout's Electron as the `io.github.pina-i:` handler,
// so the system browser's redirect after a sign-in reaches the running app. A packaged app's
// installer declares the scheme instead. Writes one .desktop file and sets it as the scheme's
// default; running it again changes nothing.
import { execFileSync } from "child_process"
import { mkdirSync, writeFileSync } from "fs"
import { createRequire } from "module"
import os from "os"
import path from "path"

if (process.platform !== "linux") process.exit(0)

const electron = createRequire(import.meta.url)("electron")
const app = path.resolve(import.meta.dirname, "..")
const name = "pinai-desktop-dev.desktop"
const dir = path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local/share"), "applications")

mkdirSync(dir, { recursive: true })
writeFileSync(
    path.join(dir, name),
    [
        "[Desktop Entry]",
        "Type=Application",
        "Name=Pīna'i (development)",
        `Exec="${electron}" "${app}" %u`,
        "NoDisplay=true",
        "Terminal=false",
        "MimeType=x-scheme-handler/io.github.pina-i;",
        "",
    ].join("\n"),
)
try {
    execFileSync("xdg-mime", ["default", name, "x-scheme-handler/io.github.pina-i"])
} catch {
    console.warn(`xdg-mime is missing: the browser won't hand sign-ins back to the app (${name} written)`)
}
