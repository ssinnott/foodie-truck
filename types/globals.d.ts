// Ambient declarations for the debug hooks index.html installs before the module graph loads
// (docs/ARCHITECTURE.md section 6), and for the prefixed WebAudio constructors Safari still ships
// (engine/audio.ts falls back to them). Declaration-only: never imported, never shipped.
interface Window {
  __game: any;
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
}
