/**
 * The MLS engine's contract (`@pinai/mls/contract`), played on the WASM bundle the app loads. The
 * phone plays the same scenarios on the native build.
 */
import { beforeAll, describe, it } from "vitest"

import { SCENARIOS } from "@pinai/mls/contract/scenarios"
import type { ContractEngine } from "@pinai/mls/contract/devices"
import { MlsAdapter } from "@pinai/mls/wasm.adapter"

import { loadWasmModule } from "./setup/wasm"

let wasmModule: WebAssembly.Module

beforeAll(async () => {
    wasmModule = await loadWasmModule()
})

async function make(): Promise<ContractEngine> {
    const engine = new MlsAdapter()
    await engine.initialize({ module_or_path: wasmModule } as never)
    return engine
}

describe("the MLS engine's contract, on the WASM bundle", () => {
    for (const scenario of SCENARIOS) {
        it(scenario.name, () => scenario.run(make))
    }
})
