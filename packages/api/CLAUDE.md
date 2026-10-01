# @pinai/api

The IdP's HTTP and WebSocket surface, as adapters implementing domain ports.

Thirteen files, one per resource: OIDC, DMs, groups, social, privacy (blocks
and the contact setting), presence, TOTP, user, user settings, device
directory, the E2EE key directory, the history archive, and the WebSocket
connection. `ky` for REST, `XMLHttpRequest` in `dm-api` where upload
progress is needed, the platform `WebSocket` for the live connection.

Nothing here is browser-specific. `fetch`, `XMLHttpRequest`, `FormData`,
`File`, `Blob` and `WebSocket` all exist on React Native, so this package is
expected to move over unchanged — it is the cheapest of the shared packages
to have got right.

Depends on `@pinai/domain` and `ky`, and on nothing else. In particular it
does not depend on `@pinai/crypto`: the key directory's contract lives in the
domain as `IKeyDirectoryPort`, which is what keeps the two independent.

## Conventions

- Bytes in, bytes out. Base64 is the wire format for binary fields; decoding
  happens here, via `@pinai/domain/lib/bytes`, so callers never see it.
- Errors are unwrapped from `HTTPError` into plain `Error` with the server's
  message where there is one, so use cases do not import `ky` to read a
  failure. The DM, group, social, privacy and key-directory adapters, whose
  refusals the UI tells apart, raise the domain's `IdpError` instead
  (`idp-error.ts`): status, `error` code and `actor_uri`, with the
  `error_description` as the message. Match on the code, never the words.
