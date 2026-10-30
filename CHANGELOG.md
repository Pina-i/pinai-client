# Changelog

## [0.2.0](https://github.com/Pina-i/pinai-client/compare/v0.1.0...v0.2.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* **web:** DEFAULT_IDP_URL (image) and VITE_DEFAULT_IDP_URL (build) are gone; the landing pre-fills the last instance submitted, and a link to /?instance= fills one in.

### Features

* **desktop:** check, download and install updates ([f976bf1](https://github.com/Pina-i/pinai-client/commit/f976bf1c7a2a6bcd46a1e418c4c866484b7a9992))
* **desktop:** tell the page about updates ([fe0cf54](https://github.com/Pina-i/pinai-client/commit/fe0cf54b90aaee08d7bd0db53146a99ac07e73c2))
* **desktop:** the packaged app refuses a debugger's switches ([7c528bc](https://github.com/Pina-i/pinai-client/commit/7c528bc268a9d4b9c3f9d19c99976526f44a3a52))
* **domain:** remember the last instance submitted ([67955eb](https://github.com/Pina-i/pinai-client/commit/67955eb7150c1a8835e2c5aebc85719914122347))
* **web:** a notice when the desktop app has an update ([363f50d](https://github.com/Pina-i/pinai-client/commit/363f50defd32d824e02536b8158f310868c4c66a))
* **web:** an updates port, the desktop's and the browser's ([32bd1a8](https://github.com/Pina-i/pinai-client/commit/32bd1a8f15d84484bdff149dcf42bcfca10f48d2))
* **web:** download buttons that download the installer ([c7646b3](https://github.com/Pina-i/pinai-client/commit/c7646b33c2a23dc92512e134567d0afc477abf91))
* **web:** no default instance, in the build or the image ([6e2ac5d](https://github.com/Pina-i/pinai-client/commit/6e2ac5ddd0bebd3357dfaa47bc14f1818d6a963c))
* **web:** the landing starts with the last instance submitted ([9490ec2](https://github.com/Pina-i/pinai-client/commit/9490ec2cc39bd7c70e8d2cb2a7a9e0df07eb3dcd))


### Bug Fixes

* **desktop:** give the window its icon on Linux ([f9058b4](https://github.com/Pina-i/pinai-client/commit/f9058b4eff4aa68d3937c564c2a05104cdd31ba2))
* **desktop:** reopen the window from the Dock on macOS ([3c3ca72](https://github.com/Pina-i/pinai-client/commit/3c3ca7229a7724a019e0a93e5d811125cc31b893))

## 0.1.0 (2026-10-30)


### Features

* **desktop:** load the built app from app://pinai ([c27d592](https://github.com/Pina-i/pinai-client/commit/c27d592d1d6205b4407fe189a4de7bc7dffc1a83))
* **desktop:** serve the built renderer at app://pinai ([89bd254](https://github.com/Pina-i/pinai-client/commit/89bd2540aaa1c07acb84e507e63d7b0ee512f44f))
* **desktop:** tell the app's pages by protocol and host ([7635409](https://github.com/Pina-i/pinai-client/commit/763540993561730f4c2807f2477b44caa4fd16fc))
* **devices:** 'Restore history' link in Settings → Devices header ([ccad3e0](https://github.com/Pina-i/pinai-client/commit/ccad3e002f890b2470baab0976bc2057e8761761))
* **e2ee:** attestation-chain adapter — verify IdP→DRK→leaf chain with rotation safety ([33b6a3f](https://github.com/Pina-i/pinai-client/commit/33b6a3f1fb25b861bd90eb06f7e791af88573bd0))
* **e2ee:** HistoryArchiveAdapter — Argon2id HAK derive + AES-256-GCM encrypt/decrypt ([5c22f9b](https://github.com/Pina-i/pinai-client/commit/5c22f9bddc4456f74f2c7deca05e58c92276112e))
* **e2ee:** registerDevice + history-backup methods on IE2eePort + E2eeAdapter ([4621302](https://github.com/Pina-i/pinai-client/commit/462130275964121ffe706e787216bf4128623825))
* **e2ee:** storage IDB v3→v4 + key-directory registerDevice — additive Phase 7 wiring ([403d8e3](https://github.com/Pina-i/pinai-client/commit/403d8e3bd38e307a84ec8737a67df651f7bdd278))
* **friends:** remove a friend ([baef8a3](https://github.com/Pina-i/pinai-client/commit/baef8a3efa4e0fd6115737481fb08b325061aec9))
* **history:** IHistoryArchivePort + REST adapter for /api/history/* endpoints ([589c78c](https://github.com/Pina-i/pinai-client/commit/589c78cd2be5376f8bda4e41f591425a2ab87c26))
* **jwks:** JwksCacheAdapter with 1h TTL, in-flight dedup, refresh-on-invalidate ([238720f](https://github.com/Pina-i/pinai-client/commit/238720f59d7ab4d644f970618299f00ff4359aee))
* **phase-4:** multi-device fanout hook + history-archive flusher + WS device_joined ([1dee6bc](https://github.com/Pina-i/pinai-client/commit/1dee6bc05091224fd497b01c521fc5d425aae8db))
* **phase-5 partial:** wire bootstrap → registerDevice + DevicesEditor Clear → clearHistoryBackup ([88db44b](https://github.com/Pina-i/pinai-client/commit/88db44b26d9fa3e6fa4d6919d7307e5b09dac1ce))
* **phase-5:** rip out RecoveryRestorePage + useFingerprint + e2ee-debug + gate restore branch ([f4887f5](https://github.com/Pina-i/pinai-client/commit/f4887f5d3742fc4dcd0e63816576cfdb402918a2))
* **phase-6:** recovery passphrase onboarding (6a) + Settings → Devices (6b) baseline ([e352905](https://github.com/Pina-i/pinai-client/commit/e352905e8a6f13e44e2c2cc6a4c959abc78aed09))
* **phase-7 restore:** end-to-end history-backup loop — page, route, upload, restore wiring ([12b8ce3](https://github.com/Pina-i/pinai-client/commit/12b8ce3f4cd06af83ac857c8baf42978681584a4))
* **web:** a Content-Security-Policy for the built app ([9b29749](https://github.com/Pina-i/pinai-client/commit/9b2974965b03a7cc2067e47c50c69af72d847034))
* **web:** host the fonts in the app ([3005ea7](https://github.com/Pina-i/pinai-client/commit/3005ea71202dd869da2b9ce3f4d91832ca396975))


### Bug Fixes

* **desktop:** no framing of the app's 404 either ([c830294](https://github.com/Pina-i/pinai-client/commit/c830294d3d26ec2baf3ef87d8174dcfbc7d736f9))
* **desktop:** other origins can't read app://pinai ([d7c47d0](https://github.com/Pina-i/pinai-client/commit/d7c47d07fd347f894df64db2ca48590ea020977f))
* **react:** remove the last ref-during-render and effect-synchronised state ([cac83f2](https://github.com/Pina-i/pinai-client/commit/cac83f2b80df9a1f9771c1bedf6366f7b1111994))
* restore localStorage under jsdom, close two type holes ([c039cd7](https://github.com/Pina-i/pinai-client/commit/c039cd7970d77e7530e9f16642f0d8bb9493230f))
* **web:** generate the route tree before typecheck ([a76c1d1](https://github.com/Pina-i/pinai-client/commit/a76c1d1a67ceb4a5395d60fc8f79821b6ec63304))
* **web:** hash inline scripts as the browser parses them ([c5d23b8](https://github.com/Pina-i/pinai-client/commit/c5d23b862881ff5c324ab22f4f34b5e49e687250))
