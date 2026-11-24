import type { HistoryRestoreState } from "@pinai/domain/usecases/e2ee/restore-due-history.usecase"

/**
 * The phone keeps no messages yet, and `HistoryRestore` run with nowhere to put them would count the restore applied,
 * then clear it: it isn't run, and the restore stays due for when conversations come to the phone.
 */
export async function restoreDueHistory(): Promise<HistoryRestoreState> {
    return { kind: "idle" }
}
