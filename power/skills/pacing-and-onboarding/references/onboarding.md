# Planning the first five minutes and persisting tips

## Beat plan

Write the opening as a table before building it, and keep it in the game's design notes.

| Time | Beat | Verb taught | Failure cost | Cue |
|---|---|---|---|---|
| 0 to 10 s | Title, one input to start | Start | None | One line naming the start control for the device |
| 10 to 30 s | Safe space | Move, look | None | Leading lines toward the first goal |
| 30 to 60 s | First success | Main verb (jump, collect, shoot) | Seconds | Lit goal in view from the start |
| 1 to 2 min | First test | Main verb under light pressure | Retry in under 2 s | Tip only after 3 failures |
| 2 to 3 min | Second verb | One new verb, alone | Seconds | Tip at the point of need |
| 3 to 5 min | Combination and first peak | Both verbs together | A checkpoint back | Landmark for the next area |

Each row adds exactly one thing. If a row needs two tips, split it.

## Tip lifecycle

1. The rule first applies: emit `tipShown` with a `tipId` and show the line.
2. The player performs the action: emit `tipLearned`, hide the line, mark it learned.
3. A learned tip never introduces itself again on that profile. After 3 failures or 10 to 15 s idle at the obstacle it returns as a reminder and emits `tipReminder`, so `tipShown` stays unique per `tipId`.
4. A device change rewrites the text of a visible tip.

```ts
// check: compile
import { createSaveSystem } from '@gamedna/kit/save';
import { BINDINGS, promptLabel, type Device } from '@gamedna/kit/input';

interface Learned { tips: string[] }
const isLearned = (d: unknown): d is Learned => typeof d === 'object' && d !== null && Array.isArray((d as Learned).tips);
const save = createSaveSystem<Learned>({ key: 'trail-walk:tips', version: 1, storage: localStorage, validate: isLearned });
const learned = new Set(save.load()?.data.tips ?? []);

/** The tip line, worded for the device in use, while `id` is unlearned or the player is struggling; otherwise null. */
export function tipText(id: string, action: string, verb: string, device: Device, struggling = false): string | null {
  return learned.has(id) && !struggling ? null : `${promptLabel(BINDINGS.onFoot, action, device)} to ${verb}`;
}

/** Call when the player performs the taught action. */
export function markLearned(id: string): void {
  if (learned.has(id)) return;
  learned.add(id);
  save.save({ tips: [...learned] });
}
```

On touch, `promptLabel` returns the action name unless the overlay's button labels are passed as its fourth argument; `input.prompt(action)` from a live `createInput` already includes them.

## Wayfinding checks

- From the spawn point, screenshot the view with the HUD hidden. The first goal or its landmark is visible or clearly implied by a path.
- From each goal, the next goal or its signpost is visible.
- Every side path pays something: a resource, a shortcut, a clue or a story detail.
