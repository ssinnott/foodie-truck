// The contract every synthesized sound effect meets. A game's SFX library is a `Record<string, SfxDef>`; the
// facade (./facade.ts) plays entries by name, ducks the ones that land together and wobbles the pitch of the
// names the game lists as jittered. The library itself is a game's own: nothing here makes a sound.

/**
 * What every SFX entry is called with. `v` scales volume (already ducked for overlapping plays) and `p` scales
 * pitch, including the small random wobble the jittered names get.
 *
 * `vol` / `pitch` are the facade's public names for the same two numbers: it passes all four on every play, so
 * they are part of the contract and an entry may read either pair.
 */
export interface SfxOpts {
  v: number;
  p: number;
  vol?: number;
  pitch?: number;
}

/**
 * One entry of a game's SFX table: schedules its voices on `ctx` at absolute time `when` and returns the time it
 * ends. Pure with respect to the context, so the same call drives the game and the OfflineAudioContext
 * self-test.
 */
export type SfxDef = (ctx: BaseAudioContext, dest: AudioNode, when: number, o: SfxOpts) => number;

/** midi -> Hz, for writing an SFX table in note names. */
export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
