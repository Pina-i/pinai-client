# @pinai/api

The IdP's HTTP and WebSocket surface, as adapters implementing domain ports.

Nineteen files, one per resource: OIDC, NodeInfo (what an instance says
about itself before any sign-in), the instance's administration (its name and
description, members, invitations, reset links — `/api/admin/*`, an admin's
token only), the caller's sessions (which device each signed in, signing out
the others), DMs, groups, social, privacy (blocks and the contact setting),
presence, TOTP, user, user settings, device directory, the approval relay, the
E2EE key directory, the history archive, key shares, start over requests, and the WebSocket
connection.
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
  and device-directory adapters and the history key, upload and wipe, whose refusals the
  client tells apart, raise the domain's `IdpError` instead
  (`idp-error.ts`): status, `error` code and `actor_uri`, with the
  `error_description` as the message. Match on the code, never the words.
- The device list (`parseDeviceList`, `device-directory-api.adapter.ts`) decodes what a device
  needs to check another's chain itself — root key, attestation, HPKE key and its signature —
  and the approvals as listed; a key that isn't base64 reads as none, an approval that isn't
  one is left out. `registerDevice` sends the HPKE key and its signature with the root key.
  Each row's `display_name` is the shown name; `automatic_name` (the display name when absent),
  `chosen_name` and `client` (`app`, `browser`, anything else `unknown`) come beside it.
  `renameDevice` puts `{ name }` to `…/{id}/name` as given (`null` for the automatic name back,
  the domain's `deviceRename` decides); its refusals are `IdpError`s (`403 approval_required`,
  `403 access_denied`, `404`, `400`) (`apps/web/test/device-rename.spec.ts`).
- This device's `label` (`{ name, kind, client }`, `@pinai/domain/models/device-label`) goes with
  `registerDevice` and `uploadKeyPackages`, as the `User-Agent` goes with any request: the
  adapter is given the label's source when it is built, and leaves the field out when it answers
  `null` (`apps/web/test/key-directory-api.spec.ts`).
- The history key (`history-archive-api.adapter.ts`): `GET /api/history/key` reads a `404` as
  no key and refuses an answer whose bytes aren't their size (`parseHistoryKey`); `PUT` sets a
  generation; uploads name theirs. A device approves itself by the passphrase and reports its
  generation through the device directory (`/api/keys/devices/{id}/approvals`, `…/history-key`).
- The approval relay (`approval-relay-api.adapter.ts`, `/api/keys/devices/approval-requests`):
  the handshake's bodies as standard base64, opaque; ids lowercased as § 7.2 writes them, a
  row naming no UUID left out (`canonicalId`); `close` can be a keepalive request, to
  outlive the page; every refusal an `IdpError` (`approval_request_taken`,
  `approval_request_ended`, `approval_request_full`, `too_many_requests`). A device approves
  another by its root key through the device directory (`approveByDevice`,
  `{ by: "device", signature }`), whose list's device ids are lowercased too.
- Finding people (`social-api.adapter.ts`, `/api/users/search`, `/api/users/lookup`): the query and
  the address as query parameters. The lookup reads `404` and `400` as no account, `502` as the
  other instance out of reach, and is never retried: asking again would only wait on that instance
  again. It waits 15 s, past the 10 s the IdP gives that instance before its `502`
  (`apps/web/test/people-search-api.spec.ts`).
- Naming the session's device (`session-api.adapter.ts`): `{ device_id, signature }`, the id
  lowercased, the proof in standard base64.
- Start over requests (`start-over-api.adapter.ts`, `/api/history/start-over`): times read as epoch
  ms, ids lowercased; `GET` reads a `404` as none and refuses a body that isn't one
  (`parseStartOverRequest`, an `ended.reason` it doesn't know included); every refusal an `IdpError`
  (`already_approved`, `no_history_key`, `start_over_pending`, `too_many_requests`,
  `approval_required`, `start_over_ended`). `toIdpError` reads a refusal's `ready_at` into
  `IdpError.readyAt` (`start_over_not_ready`, from `PUT /api/history/key`). The pushes
  `start_over_requested` / `start_over_cancelled` are typed in the domain's `WsServerEvent`.
- The Delivery Service (`e2ee/key-directory.adapter.ts`, `/api/mls/*`): a commit goes with the
  GroupInfo of the epoch it opens (`group_info`); `GET …/group-info` reads a `404` as none
  (`apps/web/test/key-directory-api.spec.ts`).
- Key shares (`key-share-api.adapter.ts`, `/api/history/key-shares`): the seal's bytes as standard
  base64 both ways; `GET` reads a `404` as no share and refuses an answer whose bytes aren't their
  size or whose sender is no UUID (`parseKeyShare`, ids lowercased); every refusal an `IdpError`,
  matched by its code in the domain (`shareRefusal`).
