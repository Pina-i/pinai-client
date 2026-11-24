import type { Argon2id } from "@pinai/crypto/argon2"
import { ARGON2_SCENARIOS } from "@pinai/crypto/contract/argon2/scenarios"
import { createArgon2id } from "@/ioc"
import { ContractCheckView } from "../contract-check"
import { useContractCheck } from "../contract-check.viewmodel"

async function makeArgon2id(): Promise<Argon2id> {
    return createArgon2id()
}

/** Development builds only: Argon2id's known answers on the native library, each with its time on this phone. */
export function Argon2CheckPage() {
    const check = useContractCheck("argon2-check", ARGON2_SCENARIOS, makeArgon2id, "dev/argon2-check")
    return (
        <ContractCheckView
            title="Argon2id"
            check={check}
        />
    )
}
