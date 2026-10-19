import { Download } from "lucide-react"
import { ButtonLink } from "@/presentation/atoms/Button/Button"
import {
    currentDesktopPlatform,
    DESKTOP_PLATFORMS,
    DESKTOP_RELEASES_URL,
    DESKTOP_VERSION,
    IN_DESKTOP_APP,
} from "@/presentation/_libs/client-download"

export function ClientDownload() {
    if (IN_DESKTOP_APP) return null
    const platform = currentDesktopPlatform()

    return (
        <div>
            <p className="eye mb-2.5">Get the client</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                <ButtonLink
                    variant="secondary"
                    size="none"
                    href={DESKTOP_RELEASES_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="w-auto p-3"
                >
                    <Download size={15} strokeWidth={1.9} />
                    Download for {platform}
                    {DESKTOP_VERSION && <span className="fact fact-plain">{DESKTOP_VERSION}</span>}
                </ButtonLink>
                <span className="fact fact-plain inline-flex gap-2.5">
                    {DESKTOP_PLATFORMS.filter((other) => other !== platform).map((other) => (
                        <a
                            key={other}
                            href={DESKTOP_RELEASES_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground no-underline transition-colors hover:text-foreground"
                        >
                            {other}
                        </a>
                    ))}
                    <span>·</span>
                    <span>or stay in the browser →</span>
                </span>
            </div>
        </div>
    )
}
