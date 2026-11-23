import type { ContractEngine } from "@pinai/mls/contract/devices"
import { SCENARIOS } from "@pinai/mls/contract/scenarios"
import { createMlsEngine } from "@/ioc"
import { ContractCheckView } from "../contract-check"
import { useContractCheck } from "../contract-check.viewmodel"

async function makeEngine(): Promise<ContractEngine> {
    const engine = createMlsEngine()
    await engine.initialize()
    return engine
}

/** Development builds only: the MLS engine's contract, played on the native build. */
export function MlsCheckPage() {
    const check = useContractCheck("mls-check", SCENARIOS, makeEngine, "dev/mls-check")
    return (
        <ContractCheckView
            title="MLS engine"
            check={check}
        />
    )
}
