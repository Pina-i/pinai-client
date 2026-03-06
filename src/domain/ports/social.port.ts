import type { FollowResponse } from "@/domain/models/social"

export interface ISocialPort {
    /** Send a follow/friend request to a user by address. */
    sendFollowRequest(idpUrl: string, accessToken: string, address: string): Promise<FollowResponse>
}
