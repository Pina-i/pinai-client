import { readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// What `expo start --clear` resets, which `expo run:android` can't be asked to: Metro's transforms and its map of the
// files. Stale after a package is added or relinked, it fails a dev bundle ("Failed to replace … HMRClient.js").
const cleared = readdirSync(tmpdir()).filter((name) => name === "metro-cache" || name.startsWith("metro-file-map-"))
for (const name of cleared) rmSync(join(tmpdir(), name), { recursive: true, force: true })
console.log(cleared.length > 0 ? "Metro's cache cleared" : "Metro had no cache to clear")
