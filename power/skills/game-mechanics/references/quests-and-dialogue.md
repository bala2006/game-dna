# Quests, objectives and dialogue as data

## Quests

- A quest is an id, ordered steps and a reward. Each step is a condition on a gameplay event: kill N of a kind, collect N of an item, enter an area, talk to a character, set a flag.
- Progress is the current step and a count per quest id. It is saved as plain data and advanced only by simulation events, never by UI or render code, so headless runs complete quests.
- Counting starts when the step becomes active. Collecting ten herbs before taking the quest does not complete it unless the step says it counts what the player already holds (`inventory.count(item)` checked on activation).
- Rewards go through `inventory.add`; whatever does not fit is reported and kept claimable, never dropped silently.

## Objectives

- One main objective is always visible, plus at most three optional ones.
- Each objective names a place or a thing the player can find: "Reach the lighthouse", not "Continue the story".
- Completed objectives leave the list within 2 to 3 s with a confirmation; new ones appear with a direction cue.

## Dialogue

- A node has an id, a speaker, a text id and choices. A choice has text, an optional condition (`requires` a flag or item), optional effects (`sets` flags, gives items) and a `next` node id or null to end.
- A node without choices ends the conversation. Hide or disable a choice whose condition fails; never let every choice fail, or the player is stuck.
- Flags are strings in the save. Conditions read flags and inventory only, so a conversation replays the same from the same save.
- Check reachability from each start node: unreachable nodes are dead content.

## Checking and tracking

```ts
// check: compile
import type { EventQueue } from '@gamedna/kit/events';

interface Events {
  enemyKilled: { enemyId: number; kind: string };
  itemCollected: { item: string; count: number };
  areaEntered: { area: string };
}

type Step =
  | { on: 'enemyKilled'; kind: string; count: number }
  | { on: 'itemCollected'; item: string; count: number }
  | { on: 'areaEntered'; area: string };

interface Quest { id: string; steps: Step[]; reward: { item: string; count: number } }
interface Choice { text: string; next: string | null; requires?: string; sets?: string[] }
interface DialogueNode { id: string; speaker: string; text: string; choices: Choice[] }
interface Progress { step: number; count: number }

/** Every broken reference in quest and dialogue data; empty when the content is sound. */
export function checkContent(quests: readonly Quest[], nodes: readonly DialogueNode[], items: ReadonlySet<string>): string[] {
  const problems: string[] = [], ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) problems.push('duplicate dialogue node id');
  for (const q of quests) {
    if (!items.has(q.reward.item)) problems.push(`${q.id}: reward item ${q.reward.item} is not defined`);
    for (const s of q.steps) if (s.on === 'itemCollected' && !items.has(s.item)) problems.push(`${q.id}: step item ${s.item} is not defined`);
  }
  for (const n of nodes) for (const c of n.choices) if (c.next !== null && !ids.has(c.next)) problems.push(`${n.id}: "${c.text}" leads to missing node ${c.next}`);
  return problems;
}

/** Advances quests from gameplay events; handlers run at the queue's end-of-tick flush. */
export function trackQuests(events: EventQueue<Events>, quests: readonly Quest[], progress: Map<string, Progress>, onComplete: (q: Quest) => void): void {
  const advance = (gain: (s: Step) => number): void => {
    for (const q of quests) {
      const p = progress.get(q.id) ?? { step: 0, count: 0 }, step = q.steps[p.step];
      if (!step) continue;
      p.count += gain(step);
      if (p.count >= (step.on === 'areaEntered' ? 1 : step.count)) {
        p.step++;
        p.count = 0;
        if (p.step === q.steps.length) onComplete(q);
      }
      progress.set(q.id, p);
    }
  };
  events.on('enemyKilled', (e) => advance((s) => (s.on === 'enemyKilled' && s.kind === e.kind ? 1 : 0)));
  events.on('itemCollected', (e) => advance((s) => (s.on === 'itemCollected' && s.item === e.item ? e.count : 0)));
  events.on('areaEntered', (e) => advance((s) => (s.on === 'areaEntered' && s.area === e.area ? 1 : 0)));
}
```
