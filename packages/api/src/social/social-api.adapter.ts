import { HTTPError } from "ky"
import { idp } from "../http"
import { idpErrorFrom } from "../idp-error"
import type { AddressLookup, PeopleFound, Person } from "@pinai/domain/models/people-search"
import type { FriendListEntry, FriendRequestResponse, PendingFriendRequest } from "@pinai/domain/models/social"
import type { ISocialPort } from "@pinai/domain/ports/social.port"

export class SocialApiAdapter implements ISocialPort {
    async sendFriendRequest(idpUrl: string, accessToken: string, address: string): Promise<FriendRequestResponse> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/request`
        try {
            return await idp.post(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { address },
            }).json<FriendRequestResponse>()
        } catch (error) {
            throw await idpErrorFrom(error, "Friend request failed")
        }
    }

    async getFriends(idpUrl: string, accessToken: string): Promise<FriendListEntry[]> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends`
        try {
            return await idp.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            }).json<FriendListEntry[]>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to fetch friends")
        }
    }

    async getPendingFriendRequests(idpUrl: string, accessToken: string): Promise<PendingFriendRequest[]> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/incoming`
        try {
            return await idp.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            }).json<PendingFriendRequest[]>()
        } catch (error) {
            throw await idpErrorFrom(error, "Failed to fetch pending friend requests")
        }
    }

    async acceptFriendRequest(idpUrl: string, accessToken: string, friendshipId: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/${friendshipId}/accept`
        try {
            await idp.post(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        } catch (error) {
            throw await idpErrorFrom(error, "Accept friend request failed")
        }
    }

    async rejectFriendRequest(idpUrl: string, accessToken: string, friendshipId: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/${friendshipId}/reject`
        try {
            await idp.delete(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        } catch (error) {
            throw await idpErrorFrom(error, "Reject friend request failed")
        }
    }

    async removeFriend(idpUrl: string, accessToken: string, friendActorUri: string): Promise<void> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/friends/${encodeURIComponent(friendActorUri)}`
        try {
            await idp.delete(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        } catch (error) {
            throw await idpErrorFrom(error, "Remove friend failed")
        }
    }

    async searchPeople(idpUrl: string, accessToken: string, q: string): Promise<PeopleFound> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/users/search`
        try {
            return await idp.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                searchParams: { q },
            }).json<PeopleFound>()
        } catch (error) {
            throw await idpErrorFrom(error, "Search failed")
        }
    }

    async lookupAddress(idpUrl: string, accessToken: string, address: string): Promise<AddressLookup> {
        const url = `${idpUrl.replace(/\/$/, "")}/api/users/lookup`
        try {
            const person = await idp.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                searchParams: { address },
                // A `502` is the other instance not answering: asking again would only wait on it again.
                retry: 0,
                // The IdP gives the other instance up to 10 s (WebFinger, then its actor) before its `502`.
                timeout: 15_000,
            }).json<Person>()
            return { kind: "found", person }
        } catch (error) {
            if (error instanceof HTTPError) {
                const { status } = error.response
                // Only an address that looks complete is sent, so one the IdP can't read has no account at it.
                if (status === 404 || status === 400) return { kind: "not-found" }
                if (status === 502) return { kind: "unreachable" }
            }
            throw await idpErrorFrom(error, "Address lookup failed")
        }
    }
}
