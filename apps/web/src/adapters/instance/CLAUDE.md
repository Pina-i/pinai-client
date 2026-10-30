# adapters/instance

- `recent-instances-local-storage.adapter.ts` — `IRecentInstancesPort` over
  `localStorage` key `pinai.recent-instances`: a JSON array of origins, newest
  first. The landing shows them as the "Recent" chips; a host is added when a
  sign-in to it succeeds (`rememberInstanceUseCase`, from the callback).
- `last-instance-local-storage.adapter.ts` — `ILastInstancePort` over
  `localStorage` key `pinai.last-instance`: the origin last submitted on the
  landing (Continue), kept across sign-outs. The field starts with it, short of
  a `?instance=` arrival; `loadLastInstanceUseCase` validates it.
- Per device, shared by every account signed in on the browser.
- Never validates: `parseRecentInstances` in `@pinai/domain/models/instance`
  drops anything that isn't an instance address and caps the list at 3.
- Storage errors are swallowed: a blocked `localStorage` costs the chips and the
  pre-fill, never the sign-in.

NodeInfo itself (what the landing's resolution line reads) is not here: it is
HTTP, so it lives in `@pinai/api/instance/nodeinfo-api.adapter.ts`.
