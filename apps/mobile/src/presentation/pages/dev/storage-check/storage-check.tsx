import { STORAGE_SCENARIOS } from "@pinai/crypto/contract/storage/scenarios"
import { phoneStorageWorld } from "@/ioc/check-stores"
import { ContractCheckView } from "../contract-check"
import { useContractCheck } from "../contract-check.viewmodel"

/** Development builds only: the encrypted store's contract, on this phone's SQLite and Keystore. */
export function StorageCheckPage() {
    const check = useContractCheck("storage-check", STORAGE_SCENARIOS, phoneStorageWorld, "dev/storage-check")
    return (
        <ContractCheckView
            title="Encrypted store"
            check={check}
        />
    )
}
