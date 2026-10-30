import { mkdir, readdir, readFile, writeFile } from "fs/promises"
import path from "path"

const ENTRY = "pinai.desktop"
const OURS = "X-Pinai-AppImage=true"
// What a menu editor adds to hide an entry.
const HIDING = /^(NoDisplay|Hidden)=/

export interface MenuPlace {
    /** The AppImage file itself (`$APPIMAGE`). */
    appImage: string
    /** Where it is mounted (`$APPDIR`). */
    appDir: string
    /** `$XDG_DATA_HOME`: the entry goes under `applications/`, the icons under `icons/`. */
    dataHome: string
    /** Records the AppImage path the entry was last written for. */
    marker: string
}

export function desktopEntry(appImage: string): string {
    return [
        "[Desktop Entry]",
        "Type=Application",
        "Name=Pinai",
        "Comment=The Pīna'i desktop client",
        `Exec="${appImage}" %U`,
        `TryExec=${appImage}`,
        "Icon=pinai",
        "Terminal=false",
        "Categories=Network;",
        "StartupWMClass=pinai",
        OURS,
        "",
    ].join("\n")
}

/** Puts the AppImage in the applications menu, once and again when the file moves. Never throws. */
export async function syncMenuEntry(place: MenuPlace): Promise<void> {
    try {
        await sync(place)
    } catch {
        // A menu entry is a convenience: nothing here may reach the app.
    }
}

async function sync({ appImage, appDir, dataHome, marker }: MenuPlace): Promise<void> {
    if (!path.isAbsolute(appImage) || needsEscaping(appImage)) return
    // The AppRun of an extracted AppImage names itself, and that folder may go away.
    const inside = path.relative(appDir, appImage)
    if (!inside.startsWith("..") && !path.isAbsolute(inside)) return

    const entryFile = path.join(dataHome, "applications", ENTRY)
    const entry = await readText(entryFile)
    const recorded = await readText(marker)
    if (entry === null) {
        // The user removed it: it stays removed.
        if (recorded !== null) return
    } else {
        if (!entry.split("\n").includes(OURS)) return
        if (recorded === appImage && entry.split("\n").includes(`TryExec=${appImage}`)) return
    }

    await copyIcons(appDir, dataHome)
    const hiding = (entry ?? "").split("\n").filter((line) => HIDING.test(line))
    await mkdir(path.dirname(entryFile), { recursive: true })
    await writeFile(entryFile, desktopEntry(appImage) + hiding.map((line) => `${line}\n`).join(""))
    await mkdir(path.dirname(marker), { recursive: true })
    await writeFile(marker, appImage)
}

// The entry's Exec only escapes spaces by quoting; anything else would need more.
function needsEscaping(file: string): boolean {
    // eslint-disable-next-line no-control-regex
    return /["`$\\%\u0000-\u001f\u007f]/.test(file)
}

async function copyIcons(appDir: string, dataHome: string): Promise<void> {
    const from = path.join(appDir, "usr/share/icons/hicolor")
    for (const size of await readdir(from)) {
        const icon = await readFile(path.join(from, size, "apps/pinai.png")).catch(() => null)
        if (!icon) continue
        const to = path.join(dataHome, "icons/hicolor", size, "apps")
        await mkdir(to, { recursive: true })
        await writeFile(path.join(to, "pinai.png"), icon)
    }
}

async function readText(file: string): Promise<string | null> {
    return readFile(file, "utf8").catch(() => null)
}
