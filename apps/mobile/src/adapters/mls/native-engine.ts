import { requireNativeModule } from "expo"

import type { MlsBundle } from "@pinai/mls/bundle"
import { MlsEngine } from "@pinai/mls/engine"

// The module is shaped as `MlsBundle`; the cast is checked only at run time, by `@pinai/mls/contract`.
export function nativeMlsEngine(): MlsEngine {
    return new MlsEngine(async () => requireNativeModule<MlsBundle>("OpenMls"))
}
