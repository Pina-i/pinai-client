/**
 * A file the app is about to send somewhere, independent of where the
 * platform got it from.
 *
 * The browser has `File`, React Native hands back `{ uri, name, mimeType }`
 * from its pickers, and neither can be named in shared code. What the domain
 * actually needs is a name, a type and the bytes.
 *
 * `bytes` is eager rather than a lazy reader on purpose: under E2EE every
 * attachment is read in full to be encrypted before it is uploaded, so a
 * streaming interface would promise something this app never does.
 */
export interface LocalFile {
    /** Filename as the server should record it. */
    name: string
    /** MIME type, or `application/octet-stream` when unknown. */
    mimeType: string
    /** Full contents. */
    bytes: Uint8Array
}
