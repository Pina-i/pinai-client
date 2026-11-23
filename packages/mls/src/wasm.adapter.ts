/**
 * The engine over the openmls WASM bundle: the web's and the desktop's. The only place
 * `openmls-wasm` is imported.
 */

import init, * as wasm from "openmls-wasm"

import type { MlsBundle } from "./bundle"
import { MlsEngine } from "./engine"

export type {
    AddMemberOutput,
    CommitOutput,
    ExternalJoinOutput,
    MlsCiphertext,
    ProcessOutcome,
} from "@pinai/domain/ports/mls-engine.port"

/** A type error here is the WASM facade's API drifting from what the engine calls. */
const bundle: MlsBundle = wasm

type WasmInput = Parameters<typeof init>[0]

export class MlsAdapter extends MlsEngine<WasmInput> {
    constructor() {
        super(async (input) => {
            await init(input as never)
            wasm.start()
            return bundle
        })
    }
}
