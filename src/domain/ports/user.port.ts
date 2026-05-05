export interface IUserPort {
    uploadAvatar(
        idpUrl: string,
        accessToken: string,
        blob: Blob,
        contentType: string,
    ): Promise<{ avatar_url: string }>

    deleteAvatar(idpUrl: string, accessToken: string): Promise<void>
}
