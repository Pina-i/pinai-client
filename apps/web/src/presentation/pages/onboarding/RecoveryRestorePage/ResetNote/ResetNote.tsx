import type { ReactNode } from "react"
import { Button } from "@/presentation/atoms/Button/Button"

/** The reset page when there is no way in to offer: what it knows, and "Check again". */
export function ResetNote({ eyebrow, children, onCheckAgain }: { eyebrow: string; children: ReactNode; onCheckAgain: () => void }) {
    return (
        <section aria-label={eyebrow} className="px-[34px] py-[30px] max-[440px]:px-5">
            <p className="fact m-0 text-idle-ink">{eyebrow}</p>
            <p className="m-0 mt-2.5 text-[14px] leading-[1.6] text-muted-foreground">{children}</p>
            <Button variant="secondary" size="inline" className="mt-[22px]" onPress={onCheckAgain}>
                Check again
            </Button>
        </section>
    )
}
