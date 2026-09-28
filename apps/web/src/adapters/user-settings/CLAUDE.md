# adapters/user-settings

- `user-settings-local-storage.adapter.ts` — `IUserSettingsStorePort` over
  `localStorage`, two keys:
  - `pinai.settings.device` — `{ version, mode }`, this device's own settings.
    Shared by every account signed in on the browser.
  - `pinai.settings.account` — `{ version, appearance, notifications,
    unsynced, owner }`, this device's copy of the account settings, so the
    palette paints before the account's own copy is known (first paint, pages
    before sign-in). `unsynced` lists the sections changed here that haven't
    reached the IdP (copies written before it existed carry `synced: false`
    instead); `owner` is the actor URI of the account the copy belongs to.
- Reads next-themes' old `theme` key when the device key is absent, so a light
  choice made before settings existed survives; the first device write drops it.
- Never validates: `parseAccountSettings` / `parseDeviceSettings` in
  `@pinai/domain/models/user-settings` do.
- `index.html` reads both keys in an inline script to set `data-theme` and the
  mode class before first paint. Changing a key or its shape means changing
  that script too.
- Storage errors are swallowed: a blocked `localStorage` costs persistence,
  never the app.
