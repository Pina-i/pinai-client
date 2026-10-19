import { PronounceBadge } from "@/presentation/atoms/PronounceBadge/PronounceBadge"

/** The rule across the top of every signed-out screen. */
export function AuthTopRule() {
    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] flex justify-between px-[30px] pt-[22px]">
            <span className="pointer-events-auto inline-flex items-center gap-2">
                <PronounceBadge />
                <span className="fact fact-plain">v2.0.4</span>
            </span>
            <span className="eye pointer-events-auto">Self-hosted · Federated · Open-source</span>
        </div>
    )
}
