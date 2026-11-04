/**
 * One run at a time: a call made during one waits for it, then the calls made meanwhile are one run,
 * with the latest arguments, which answers them all.
 */
export function oneAtATime<A extends unknown[], R>(run: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
    let running: Promise<R> | null = null
    let next: { args: A; settle: Promise<R>; resolve: (r: R) => void; reject: (e: unknown) => void } | null = null
    const start = (args: A): Promise<R> => {
        const current = run(...args)
        running = current
        void current
            .catch(() => undefined)
            .then(() => {
                running = null
                const queued = next
                next = null
                if (queued) start(queued.args).then(queued.resolve, queued.reject)
            })
        return current
    }
    return (...args: A) => {
        if (!running) return start(args)
        if (next) {
            next.args = args
            return next.settle
        }
        let resolve!: (r: R) => void
        let reject!: (e: unknown) => void
        const settle = new Promise<R>((res, rej) => ((resolve = res), (reject = rej)))
        next = { args, settle, resolve, reject }
        return settle
    }
}
