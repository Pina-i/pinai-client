import { toast } from "sonner"

/**
 * One keyed toast in the app's corner for a run in the background: raised only while the app is
 * mounted, and once up, settled whatever unmounts.
 */
export class CornerToast {
    private readonly id: string
    private mounted = 0
    private up = false

    constructor(id: string) {
        this.id = id
    }

    /** The app counts as mounted until the cleanup answered is called. */
    mount(): () => void {
        this.mounted += 1
        return () => {
            this.mounted -= 1
        }
    }

    get isUp(): boolean {
        return this.up
    }

    progress(title: string): void {
        if (this.mounted === 0) return
        toast.loading(title, { id: this.id })
        this.up = true
    }

    success(title: string, description?: string): void {
        if (this.settle()) toast.success(title, { id: this.id, description })
    }

    failure(title: string, description: string): void {
        if (this.settle()) toast.error(title, { id: this.id, description })
    }

    dismiss(): void {
        if (this.settle()) toast.dismiss(this.id)
    }

    /** A new run over another engine: what was up is no longer this one's. */
    forget(): void {
        this.up = false
    }

    private settle(): boolean {
        const up = this.up
        this.up = false
        return up
    }
}
