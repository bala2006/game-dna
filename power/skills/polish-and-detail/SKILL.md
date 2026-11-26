---
name: polish-and-detail
description: Finish details. Consistency audit, world reactions, lasting marks, visible gear, lived-in spaces, variation and rare surprises. Use before a demo or release, or when a game works but feels empty or cheap.
---

# Polish and detail

Polish what the player sees most, first. A door opened 200 times matters more than a vista seen once.

## Order of work

1. Consistency of repeated interactions.
2. Reactions to the player.
3. Residue that lasts.
4. Lived-in spaces.
5. Rare surprises.

## Step 1: Consistency audit

List every interaction that repeats and fill one row each:

| Interaction | Prompt | Duration | Sound | Feedback | Shared helper |
|---|---|---|---|---|---|
| Open door | | | | | |
| Pick up | | | | | |
| Menu open | | | | | |

Every row of one kind uses the same prompt style, timing family and sound family. Each kind goes through one shared helper. Fix copies that drifted.

## Step 2: Reactions

- Props move on contact (motion-and-physics skill).
- Bystanders share a reaction state. When something big happens, the whole group changes posture together.
- Ambient characters do small tasks instead of standing still.
- Keep each reaction to one small state machine.

## Step 3: Residue

- Events leave marks: scorch, debris, decals, smoke that lingers for a few seconds and fades.
- Damage and wear show on the avatar and its vehicle.
- Cap the residue count and fade the oldest first.

## Step 4: Lived-in spaces

For each room type set:

- A prop budget, so no wall is empty at the target resolution.
- Signs and notices that also guide: exits, restricted doors, room names.
- One story detail that implies who uses the room.
- Now and then, a joke or an odd item that comments on what the player is doing.

Write every sign and brand fresh. Never use real brands or text from other games.

## Step 5: Physical exchanges

When value changes hands (buy, sell, give, unlock), show the item move: placed, taken, handled. Then update the number. A menu alone feels like bookkeeping.

## Step 6: Variation on a template

Build one template per building or room kind. Vary per instance: accent hue, prop set, entry options, clue form. Derive the variation from the seeded `rng` and the instance ID so it is the same on every run.

## Step 7: Rare surprises

Seed small one-off moments, such as an animal, a joke or an odd prop. Do not repeat one in the same session.

## Checklist before a demo

- [ ] Every repeated interaction uses its shared helper.
- [ ] Every player action has feedback.
- [ ] No room screenshot shows an empty wall at the target viewport.
- [ ] Residue is capped and fades.
- [ ] Gear and load show on the avatar.
- [ ] All signs and text are original and free of typos.
- [ ] Every asset is generated or authored and listed in `.gamedna/assets-manifest.json`.
- [ ] Reduced motion turns off shake and pulses.

## Verify

- Screenshot every room with scenario `checkpoints` in a browser session and review them together.
- Count props per room from level data in a unit test that fails below the budget.
- Residue: `stateAtEnd` on the residue count gt 0 after the event, and `stateAlways` on it lte the cap.

## Sources

- Smith and Worch, "What Happened Here? Environmental Storytelling" (GDC, 2010).
- Jonasson and Purho, "Juice It or Lose It" (GDC Europe, 2012).
- Thomas and Johnston, *The Illusion of Life* (1981): secondary action.
