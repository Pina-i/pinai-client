# Changelog

## [0.4.2](https://github.com/Pina-i/pinai-client/compare/v0.4.1...v0.4.2) (2026-11-10)


### Features

* count what waits for the user in the title and on the desktop icon ([c127fcc](https://github.com/Pina-i/pinai-client/commit/c127fcceb268414c7bedb57d62c87f55eb9e160b))
* **desktop:** keep running in the tray when the window closes ([22570d4](https://github.com/Pina-i/pinai-client/commit/22570d465c41cbdda6e5f9af7a78cb6066220435))
* **e2ee:** approve a new device with a 6-digit code ([04c9fb6](https://github.com/Pina-i/pinai-client/commit/04c9fb6e93c0e3b7d1d6cd8e049b644e12e5b020))
* **e2ee:** approved devices and a shared history passphrase ([0b71ed5](https://github.com/Pina-i/pinai-client/commit/0b71ed5231583b105edf9771290c6a63936c18d5))
* **e2ee:** bind every leaf to its device and give devices an HPKE key ([87f7006](https://github.com/Pina-i/pinai-client/commit/87f70068f5b16a432986d5278ceb6217a93163db))
* **e2ee:** carry the history passphrase to approved devices ([10d0060](https://github.com/Pina-i/pinai-client/commit/10d0060315648ce3725f4f284e113f15d4bdf83a))
* **e2ee:** decide which of the account's devices are approved ([6d2bb14](https://github.com/Pina-i/pinai-client/commit/6d2bb14ac6e9eb0c6f42dada342c35367183dfd4))
* **e2ee:** hold the history passphrase by generation ([a19839f](https://github.com/Pina-i/pinai-client/commit/a19839fdb49c4c65459b486cc2e0e655c2691a2f))
* **e2ee:** keep a device out of the app until it is approved ([a989114](https://github.com/Pina-i/pinai-client/commit/a989114ab24be83608ef5917a3f3f683901e9342))
* **e2ee:** replace the words without losing the history ([281aa90](https://github.com/Pina-i/pinai-client/commit/281aa90900f19caccff42531b7b7ca16b2b2dd5b))
* **e2ee:** wait a week to start over, and warn the approved devices ([a4b328e](https://github.com/Pina-i/pinai-client/commit/a4b328eec0b553fcc40be81102b3e2b51c3ab221))
* **e2ee:** withhold clearing the backup and signing out from unapproved devices ([4447059](https://github.com/Pina-i/pinai-client/commit/444705946bddf372d3f1611649cb41eef1bdfd36))
* unread count in the title and on the icon, and keep running in the tray ([583e27d](https://github.com/Pina-i/pinai-client/commit/583e27da90a0e15f7a0d9b42b2103c756e7d63ec))
* **web:** Settings → Devices shows who is approved, and who waits ([22bb3bb](https://github.com/Pina-i/pinai-client/commit/22bb3bb9b3113b543c62fbc5565f989814d8899d))
* **web:** the new-device page, the reset page, and starting over ([cb0aadb](https://github.com/Pina-i/pinai-client/commit/cb0aadbecaecfb1dfe12af1e1a409ba105936e3e))


### Bug Fixes

* **e2ee:** no toast for devices from before, no lockout on a reset ([fc72060](https://github.com/Pina-i/pinai-client/commit/fc72060705ab0bcd05f5a207a306dd544b2af1f9))
* **e2ee:** save to the backup only once approved, and never drop a refused batch ([7624cba](https://github.com/Pina-i/pinai-client/commit/7624cba424dd850f555494e70c01c33e74248e5f))
* **web:** drop the pinned-messages button, which opened nothing ([978a38b](https://github.com/Pina-i/pinai-client/commit/978a38b740493bb8d86baa7667a465ea805ed592))
* **web:** pin the settings close button to the overlay's corner ([359b0f6](https://github.com/Pina-i/pinai-client/commit/359b0f6f1fc4fd9b021ffe8f187dddf1ebcef5dd))
* **web:** recover from device_mismatch without signing the browser out ([10ae3a9](https://github.com/Pina-i/pinai-client/commit/10ae3a95e5c4d06d7b48fc964950d03d66bc7391))
* **web:** the history backup keeps attachments, edits and reactions ([e92803b](https://github.com/Pina-i/pinai-client/commit/e92803b304a522abee3491b94a7a5c9c240c4684))
* **web:** the history backup keeps attachments, edits and reactions ([1b15a15](https://github.com/Pina-i/pinai-client/commit/1b15a15b934506bd2e7d5db7421aa2f6c8ec9bda))

## [0.4.1](https://github.com/Pina-i/pinai-client/compare/v0.4.0...v0.4.1) (2026-11-02)


### Features

* **domain:** the rule behind the DM sidebar's search ([93f658f](https://github.com/Pina-i/pinai-client/commit/93f658ff3ec721eb344e104a9eb7fef7de161336))
* **web:** find friends and conversations from the DM sidebar's search ([a2bca09](https://github.com/Pina-i/pinai-client/commit/a2bca095cc6d3aa422a5553ad669382b3a7b45fa))
* **web:** find friends and conversations from the DM sidebar's search ([e491398](https://github.com/Pina-i/pinai-client/commit/e491398f8781c64064587c940c51a74a25c49845))

## [0.4.0](https://github.com/Pina-i/pinai-client/compare/v0.3.0...v0.4.0) (2026-11-01)


### ⚠ BREAKING CHANGES

* **web:** VITE_KLIPY_API_KEY and the web image's KLIPY_API_KEY are gone, and /config.js sets nothing. Move the key to the identity provider's .env (KLIPY_API_KEY); an instance without one has no GIF picker.

### Features

* **web:** carry the prototype's polish over to the client ([21ee124](https://github.com/Pina-i/pinai-client/commit/21ee124586a6496c7798cb4e6ec97288f17da4a4))
* **web:** carry the prototype's polish over to the client ([0a5405b](https://github.com/Pina-i/pinai-client/commit/0a5405b9542c21fcfdf2ed98b060826838a00aca))
* **web:** take the GIF picker's Klipy key from the instance's NodeInfo ([b65867a](https://github.com/Pina-i/pinai-client/commit/b65867a3cdc6554954ccf7654c9a91baf11d9c8d))

## [0.3.0](https://github.com/Pina-i/pinai-client/compare/v0.2.1...v0.3.0) (2026-10-31)


### Features

* **desktop:** draw the window's title bar in the app's own colours ([5096dd7](https://github.com/Pina-i/pinai-client/commit/5096dd7f40dec3f992d7ff67881d501bb2d77cd9))
* **desktop:** open the window in the theme it closed in ([d002362](https://github.com/Pina-i/pinai-client/commit/d0023627fb358758417e0e838167015d14ff5715))

## [0.2.1](https://github.com/Pina-i/pinai-client/compare/v0.2.0...v0.2.1) (2026-10-30)


### Features

* **desktop:** the AppImage adds itself to the applications menu ([88e60cd](https://github.com/Pina-i/pinai-client/commit/88e60cdcc5e9cd70a90a68382c92b14ca931c028))

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
