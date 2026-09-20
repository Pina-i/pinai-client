import ky, { HTTPError } from "ky"
import type { FriendListEntry, FriendRequestResponse, PendingFriendRequest } from "@/domain/models/social"
import type { ISocialPort } from "@/domain/ports/social.port"

export class SocialApiAdapter implements ISocialPort {
    async sendFriendRequest(idpUrl: string, accessToken: string, address: string): Promise<FriendRequestResponse> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/request`
        try {
            return await ky.post(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { address },
            }).json<FriendRequestResponse>()
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Friend request failed: ${error.response.status}`)
            }
            throw error
        }
    }

    async getFriends(idpUrl: string, accessToken: string): Promise<FriendListEntry[]> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends`
        try {
            return await ky.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            }).json<FriendListEntry[]>()
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to fetch friends: ${error.response.status}`)
            }
            throw error
        }
    }

    async getPendingFriendRequests(idpUrl: string, accessToken: string): Promise<PendingFriendRequest[]> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/incoming`
        try {
            return await ky.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            }).json<PendingFriendRequest[]>()
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Failed to fetch pending friend requests: ${error.response.status}`)
            }
            throw error
        }
    }

    async acceptFriendRequest(idpUrl: string, accessToken: string, friendshipId: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/${friendshipId}/accept`
        try {
            await ky.post(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Accept friend request failed: ${error.response.status}`)
            }
            throw error
        }
    }

    async rejectFriendRequest(idpUrl: string, accessToken: string, friendshipId: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/${friendshipId}/reject`
        try {
            await ky.delete(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        } catch (error) {
            if (error instanceof HTTPError) {
                const err = await error.response.json().catch(() => ({})) as { error?: string }
                throw new Error(err.error ?? `Reject friend request failed: ${error.response.status}`)
            }
            throw error
        }
    }
}
