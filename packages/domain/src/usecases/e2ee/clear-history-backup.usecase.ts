import type { IHistoryArchivePort } from "../../ports/history-archive.port"

/**
 * Settings → Devices → "Clear history backup" (`identity-provider/specs/e2ee.md § 3.8`): the saved
 * entries erased, nothing more — the passphrase and its generation stay, and saving goes on.
 */
export function clearHistoryBackupUseCase(deps: { historyArchivePort: IHistoryArchivePort }) {
    return async (idpUrl: string, accessToken: string): Promise<void> => {
        await deps.historyArchivePort.wipeArchive(idpUrl, accessToken)
    }
}
