// This game's audio: the library's WebAudio facade (src/lib/audio/facade.ts) built over this game's SFX table and
// its tracks (docs/ARCHITECTURE.md section 3, docs/GDD.md section 11). The buses, the look-ahead music scheduler,
// the crossfade, the duck window and the offline self-test are engine and shared with the sibling game; the
// sounds and the nine tracks are this game's, and live in ./audio/sfx.ts and ./audio/music.ts.
//
// In test mode (`audio.testMode = true` before init) no AudioContext is ever created and every call is a no-op:
// the headless playtests step thousands of frames and must not synthesize a note of it. `audio.selfTest()`
// renders every canonical sound and every track through an OfflineAudioContext, which is how the playtest proves
// every sound and track is audible without a speaker.
//
// Nothing in here is simulation state. A screen may call `play` from its update() - the calls read no rng, write
// nothing a checksum hashes, and a peer that hears a different pitch wobble is still on the same frame.
import { createAudio } from '../lib/audio/facade.ts';
import { SFX_DEFS, CANONICAL_SFX, JITTERED } from './audio/sfx.ts';
import { TRACKS, CANONICAL_TRACKS } from './audio/music.ts';

export { noteFreq } from '../lib/audio/facade.ts';
export type { Audio, PlayOpts, Measure, SfxReport, TrackReport, SelfTestReport } from '../lib/audio/facade.ts';

/** Audio singleton. Set `audio.testMode = true` before init() in autotest mode. */
export const audio = createAudio({
  sfx: SFX_DEFS, jittered: JITTERED, canonicalSfx: CANONICAL_SFX,
  tracks: TRACKS, canonicalTracks: CANONICAL_TRACKS,
  // Unknown names and failed sounds warn once, and only with `?debug=1` (window.__game.options.debug).
  debug: () => { try { return !!(window.__game && window.__game.options && window.__game.options.debug); } catch { return false; } },
});
