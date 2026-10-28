# @pinai/api

The IdP's HTTP and WebSocket surface, as adapters implementing domain ports.

Sixteen files, one per resource: OIDC, NodeInfo (what an instance says
about itself before any sign-in), the instance's administration (its name and
description, members, invitations, reset links — `/api/admin/*`, an admin's
token only), the caller's sessions (which device each signed in, signing out
the others), DMs, groups, social, privacy (blocks and the contact setting),
presence, TOTP, user, user settings, device directory, the E2EE key
directory, the history archive, and the WebSocket connection.
`ky` for REST, `XMLHttpRequest` in `dm-api` where upload progress is needed,
the platform `WebSocket` for the live connection.

Nothing here is browser-specific. `fetch`, `XMLHttpRequest`, `FormData`,
`File`, `Blob` and `WebSocket` all exist on React Native, so this package is
expected to move over unchanged — it is the cheapest of the shared packages
to have got right.

Depends on `@pinai/domain` and `ky`, and on nothing else. In particular it
does not depend on `@pinai/crypto`: the key directory's contract lives in the
domain as `IKeyDirectoryPort`, which is what keeps the two independent.

## Conventions

- `OidcAdapter` also revokes (`/revoke`, RFC 7009) for the desktop's sign-out; it runs in
  Electron's main process as well as in pages, so it stays free of browser globals.
- Every bearer route goes through `idp` (`http.ts`), a `ky` instance whose `401` hook renews the
  session (`retryUnauthorizedWith`, wired by the app) and sends the request once more with the
  new token — but not for a challenge asking the password again
  (`insufficient_user_authentication`): a renewal brings no newer one. OIDC and NodeInfo use plain `ky`: a refused `/token` must never renew. The DM
  upload's `XMLHttpRequest` isn't covered; the timed renewal keeps its token fresh.
- The WebSocket reads the access token at each attempt (`connect(idpUrl, accessToken)`), and
  reports a close with `1008` — the IdP ended its session — instead of reconnecting.
- Bytes in, bytes out. Base64 is the wire format for binary fields; decoding
  happens here, via `@pinai/domain/lib/bytes`, so callers never see it.
- Errors are unwrapped from `HTTPError` into plain `Error` with the server's
  message where there is one, so use cases do not import `ky` to read a
  failure. The DM, group, social, privacy, key-directory, session, admin, TOTP
  and device-directory adapters and the history wipe, whose refusals the UI tells
  apart, raise the domain's `IdpError` instead
  (`idp-error.ts`): status, `error` code and `actor_uri`, with the
  `error_description` as the message. Match on the code, never the words.
