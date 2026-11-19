# adapters/device

- `device-facts-browser.adapter.ts` — `IDeviceFactsPort` in a browser: the `User-Agent` at once
  (`known`), then Chromium's client hints (`navigator.userAgentData.getHighEntropyValues(["model",
  "platformVersion"])` and `mobile`) within `HINTS_TIMEOUT_MS` (500 ms). Refused, late or absent —
  Firefox and Safari have none —, the facts go without them and the name is the `User-Agent`'s;
  late, the gather says so (`late`), and the next request asks again.
  `composeDeviceLabel` (`@pinai/domain/models/device-label`) makes the label of them; the IoC
  composes it once a run (`thisDeviceLabel`), started as the IoC is built, and hands it to
  `KeyDirectoryApiAdapter`. The desktop app gathers its own instead
  (`adapters/desktop/device-facts-desktop.adapter.ts`): Chrome never names the app.
