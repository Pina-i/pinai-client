import type { FollowResponse } from "@/domain/models/social"

export interface ISocialPort {
    /** Send a follow/friend request to a user by handle. */
    sendFollowRequest(idpUrl: string, accessToken: string, handle: string): Promise<FollowResponse>
}
