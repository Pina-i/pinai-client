# adapters/sound

- `notification-sound-web-audio.adapter.ts` — `INotificationSoundPort` over the
  Web Audio API. Whether a message rings is decided before it gets here
  (`shouldPingForMessage`), and how often by `pingsAgain` (`@pinai/domain/models/mute`):
  a burst within 420 ms is one sound.
- One `AudioContext` for the page's life, never one per message (browsers cap
  how many a page may open):
  - created and resumed by the first pointer or key gesture, since a browser
    plays nothing before one, and Safari only unlocks audio from inside it;
  - suspended whenever nothing rings, so the audio device isn't held open;
  - a ping waiting on a resume is dropped after 1 s rather than rung late.
- `toere.ts` — Tō‘ere, the slit drum, synthesised node for node from the design
  system's sound lab: no audio file. Electron's renderer plays it the same way;
  a mobile app brings its own adapter.
- Without Web Audio (jsdom included), messages arrive silently.
