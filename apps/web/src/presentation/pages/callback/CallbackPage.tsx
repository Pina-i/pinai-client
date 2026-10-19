import { ShieldAlert } from "lucide-react"
import { Backdrop } from "@/presentation/atoms/backdrop/backdrop"
import { Link } from "@/presentation/atoms/Link/Link"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { useCallbackPageViewModel } from "./CallbackPage.viewmodel"

// While the code is exchanged, the splash screen covers this page.
export function CallbackPage() {
    const { failure } = useCallbackPageViewModel()

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
            <Backdrop />
            {failure && (
                <PageTransition className="relative z-[2] w-full max-w-sm">
                    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-line bg-surf px-6 py-7 text-center backdrop-blur-[14px]">
                        <ShieldAlert className="h-9 w-9 text-dnd" />
                        <p className="title text-[20px] font-normal text-foreground">Sign-in failed</p>
                        <p className="text-[13px] leading-[1.55] text-muted-foreground">{failure.message}</p>
                        {failure.code && <p className="fact fact-plain">{failure.code}</p>}
                        <Link href="/">Pick your home again</Link>
                    </div>
                </PageTransition>
            )}
        </div>
    )
}
