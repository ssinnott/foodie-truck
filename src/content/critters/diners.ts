// THE VILLAGE'S ROLL (docs/GDD.md sections 2 and 3): the id of every diner who can stand in a day's line, in the order
// the day plan and the recipe book count them. It is a bare list on purpose - no art, no rig - so game/run.ts can
// deal from it without pulling the whole critter library into the simulation. The definitions live in customers.ts
// (the original three) and villagers.ts (the rest); tools/art-check.js fails the build if the two ever disagree.
//
// APPEND, NEVER REORDER OR REMOVE: the plan picks diners by shuffling this list from the day's seed, so a new id
// in the middle would deal a different crowd to every seed already in the wild, and the book keys its tallies by id.
export const DINERS: readonly string[] = Object.freeze([
  'owl', 'otter', 'goat',
  'fox', 'badger', 'hedgehog', 'pig', 'cow', 'squirrel', 'deer', 'bear', 'raccoon', 'cat', 'dog', 'hen', 'duck', 'mole', 'tortoise', 'beaver',
]);
