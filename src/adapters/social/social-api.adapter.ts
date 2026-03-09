import type { FriendListEntry, FriendRequestResponse, PendingFriendRequest } from "@/domain/models/social"
import type { ISocialPort } from "@/domain/ports/social.port"

export class SocialApiAdapter implements ISocialPort {
    async sendFriendRequest(idpUrl: string, accessToken: string, address: string): Promise<FriendRequestResponse> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/request`
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
            throw new Error(err.error ?? `Friend request failed: ${res.status}`)
        }
        return res.json() as Promise<FriendRequestResponse>
    }

    async getFriends(idpUrl: string, accessToken: string): Promise<FriendListEntry[]> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends`
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(err.error ?? `Failed to fetch friends: ${res.status}`)
        }
        return res.json() as Promise<FriendListEntry[]>
    }

    async getPendingFriendRequests(idpUrl: string, accessToken: string): Promise<PendingFriendRequest[]> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/incoming`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(err.error ?? `Failed to fetch pending friend requests: ${res.status}`)
        }
        return res.json() as Promise<PendingFriendRequest[]>
    }

    async acceptFriendRequest(idpUrl: string, accessToken: string, friendshipId: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/${friendshipId}/accept`
        const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(err.error ?? `Accept friend request failed: ${res.status}`)
        }
    }

    async rejectFriendRequest(idpUrl: string, accessToken: string, friendshipId: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/${friendshipId}/reject`
        const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as { error?: string }
            throw new Error(err.error ?? `Reject friend request failed: ${res.status}`)
        }
    }
}
