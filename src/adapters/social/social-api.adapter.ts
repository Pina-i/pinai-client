import type { FollowResponse } from "@/domain/models/social"
import type { ISocialPort } from "@/domain/ports/social.port"

export class SocialApiAdapter implements ISocialPort {
    async sendFollowRequest(idpUrl: string, accessToken: string, address: string): Promise<FollowResponse> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/follow`
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ address }),
        })

        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(err.error ?? `Follow request failed: ${res.status}`)
        }

        return res.json() as Promise<FollowResponse>
    }
}
