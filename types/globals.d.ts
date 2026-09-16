// Ambient declarations for the debug hooks index.html installs before the module graph loads
// (docs/ARCHITECTURE.md section 6). Declaration-only: never imported, never shipped.
interface Window {
  __game: any;
}
