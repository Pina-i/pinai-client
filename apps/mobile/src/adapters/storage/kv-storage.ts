import type { ILastInstancePort, IRecentInstancesPort } from "@pinai/domain/ports/instance.port"

/** The synchronous half of `expo-sqlite/kv-store`. */
export interface SyncKeyValue {
    getItemSync(key: string): string | null
    setItemSync(key: string, value: string): void
    removeItemSync(key: string): boolean
}

function attempt<T>(run: () => T, fallback: T): T {
    try {
        return run()
    } catch {
        return fallback
    }
}

export class RecentInstancesKvAdapter implements IRecentInstancesPort {
    private readonly kv: SyncKeyValue

    constructor(kv: SyncKeyValue) {
        this.kv = kv
    }

    read(): unknown {
        return attempt(() => {
            const stored = this.kv.getItemSync("pinai.recent-instances")
            return stored ? JSON.parse(stored) : null
        }, null)
    }

    write(origins: string[]): void {
        attempt(() => this.kv.setItemSync("pinai.recent-instances", JSON.stringify(origins)), undefined)
    }
}

export class LastInstanceKvAdapter implements ILastInstancePort {
    private readonly kv: SyncKeyValue

    constructor(kv: SyncKeyValue) {
        this.kv = kv
    }

    read(): unknown {
        return attempt(() => this.kv.getItemSync("pinai.last-instance"), null)
    }

    write(origin: string): void {
        attempt(() => this.kv.setItemSync("pinai.last-instance", origin), undefined)
    }
}

/** The instance this phone is signed in to, so a restart knows where to resume. */
export class SignedInInstanceKvAdapter {
    private readonly kv: SyncKeyValue

    constructor(kv: SyncKeyValue) {
        this.kv = kv
    }

    read(): string | null {
        return attempt(() => this.kv.getItemSync("pinai.signed-in-instance"), null)
    }

    write(origin: string | null): void {
        attempt(() => (origin ? this.kv.setItemSync("pinai.signed-in-instance", origin) : this.kv.removeItemSync("pinai.signed-in-instance")), undefined)
    }
}
