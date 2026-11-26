---
name: gamedna-mode
description: Entry point for building or changing any game with GameDNA. Picks the build target and a genre recipe, then names one skill per step. Use for /gamedna-mode, "make a game", or any game feature, look or fix request.
---

# GameDNA mode

This file routes work. It holds no craft detail. At each step, load the named skill and follow it. Load only the skills the current step needs, and drop a skill from your plan once its step is done.

## Non-negotiables

- Name the data shape before code: simulation state, the action map, level data, the look sheet.
- Rules run in a fixed-step simulation with a seeded `rng`. Rendering, camera, particles and sound read state and never write it.
- Use real-world scale. In 3D, 1 unit is 1 m. In 2D, choose pixels per meter and record it (world-building skill).
- Bind every input device the target platform has before the first playtest (controls-and-input skill).
- The user picks subjective outcomes. Offer 2-3 variants through the refinement skill. Tools never pick.
- Use only generated or authored assets. Never sample or trace another game's look (art-direction skill, originality check).
- Done means checked on the real artifact: every camera view and every input device, by screenshot and by asserted state.

## Step 1: Pick the build target

| Target | Pick when | Engine skill | Checks |
|---|---|---|---|
| Phaser project in this repo | 2D, and the user wants GameDNA's MCP tools | technical-art for assets | playtesting skill |
| three.js on the GameDNA Kit, Vite | Any 3D game | three-js | three-js skill, Verify |
| One HTML file | The user asks for one file to share | three-js, then pack the build into one file | three-js skill, Verify |
| Godot 4 project | The user works in Godot | `gd_install_adapter`, then the wiring in `power/adapters/godot/README.md` | playtesting skill, with `commandId: "headless"` |

GameDNA's MCP tools reach a game through a development-only adapter. Phaser and Godot 4 adapters ship today. `gd_project_status` detects the other engines and labels them unverified until their adapter ships, and three.js games are checked with Playwright until then. For 3D, the Kit (`packages/kit`, shipped in the Power as `kit/`) holds the tested code for input, cameras, vehicles, characters, terrain and the stage. Steps below name the Kit module each skill uses.

## Step 2: Pick a recipe

When the request matches a genre, read its recipe. A recipe gives the step order, starting numbers and acceptance checks for that genre.

| Recipe | Matches |
|---|---|
| `recipes/racing.md` | Cars, karts or bikes on a track or roads |
| `recipes/platformer.md` | Running and jumping, side view |
| `recipes/top-down-action.md` | Arena, twin-stick, survivor, top-down adventure |
| `recipes/third-person-action.md` | A 3D character seen from behind: explore, fight, sneak |
| `recipes/first-person.md` | A 3D game seen through the character's eyes |

No match: follow the general order below and write a short recipe of your own into the game's `.kiro/specs/game/design.md`.

## Step 3: General order

| # | Step | Skill | Skip when |
|---|---|---|---|
| 1 | Concept, loop, protected rules, design record | game-direction | The game exists and the loop is settled |
| 2 | Look: key, palette, shapes, materials | art-direction | The look sheet exists |
| 3 | World: scale, layout, terrain, roads, vegetation | world-building | Single-screen game |
| 4 | Rooms, challenges, waves | level-design | No authored levels |
| 5 | Characters | character-design | No characters |
| 5 | Vehicles | vehicle-design | No vehicles |
| 6 | Controls on every device | controls-and-input | Never |
| 7 | Camera views | camera | Never |
| 8 | Weight and handling | motion-and-physics | Nothing moves |
| 9 | Jump and hit feel | game-feel | No jumping or combat |
| 10 | Systems that force choices | game-mechanics | Pure toy or sandbox |
| 11 | HUD, prompts, menus, sound levels | feedback-and-ui | Never |
| 12 | Scene lighting and color meaning | light-and-color | Flat single-area game |
| 13 | Session rhythm, teaching, wayfinding | pacing-and-guidance | Sessions under a minute |
| 14 | Finish details | polish-and-detail | Throwaway prototype |
| 15 | 2D assets | technical-art | 3D target |
| 16 | 3D engine work | three-js | Phaser target |
| 17 | Tests and evidence | playtesting (Phaser) or three-js (3D) | Never |
| 18 | Options for the user | refinement | No subjective tuning left |

## Changes to an existing game

Load only the skill for the symptom. If the first skill does not fix it, load the second.

| The user says | First skill | Then |
|---|---|---|
| "Looks fake, flat or cheap", "make it realistic" | art-direction | light-and-color |
| "The car looks like a box", "the vehicle is wrong" | vehicle-design | art-direction |
| "The character looks wrong", "wrong size" | character-design | world-building |
| "Camera is bad", "add first person", "can't see ahead" | camera | |
| "Add mouse, gamepad or phone controls", "my tap didn't register" | controls-and-input | feedback-and-ui |
| "Floaty", "no weight", "slides too much" | motion-and-physics | game-feel |
| "World is empty, too big or too small" | world-building | polish-and-detail |
| "Boring", "nothing to decide" | game-mechanics | pacing-and-guidance |
| "I don't know what to do or where to go" | pacing-and-guidance | feedback-and-ui |
| "It's slow", "low frame rate" | three-js | |

## Reply

Lead with what the user can now do in the game. Name the skills that shaped the work and the checks that passed, with the evidence for each: a screenshot reviewed, a state asserted, a measurement taken. List what was not checked.
