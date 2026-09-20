import type { FriendListEntry, FriendRequestResponse, PendingFriendRequest } from "../models/social"

export interface ISocialPort {
    /** Send a friend request to a user by address. */
    sendFriendRequest(idpUrl: string, accessToken: string, address: string): Promise<FriendRequestResponse>
    /** Fetch all accepted friends (joined across local users + remote actors). */
    getFriends(idpUrl: string, accessToken: string): Promise<FriendListEntry[]>
    /** Fetch pending incoming friend requests (for seeding notifications on load). */
    getPendingFriendRequests(idpUrl: string, accessToken: string): Promise<PendingFriendRequest[]>
    /** Accept an incoming friend request. */
    acceptFriendRequest(idpUrl: string, accessToken: string, friendshipId: string): Promise<void>
    /** Reject an incoming friend request (deletes the friendship row). */
    rejectFriendRequest(idpUrl: string, accessToken: string, friendshipId: string): Promise<void>
}
