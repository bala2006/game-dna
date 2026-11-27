# Puzzle

## Player experience

The moment a rule clicks. The player decides which move to make and in what order, with every rule visible on the board. Failure is information: undo is instant, restart is cheap, and nothing is hidden behind reflexes unless the design asks for it.

## Systems

| System | Owner specialist | Needed when | Skills | Kit modules |
|---|---|---|---|---|
| Board state, legal moves, win test, undo stack | gamedna-gameplay | Core | `game-mechanics`, `game-architecture` | `@gamedna/kit/events` |
| Level data and solved-level saves | gamedna-gameplay | Core; saves from about ten levels up | `game-architecture` | `@gamedna/kit/save` |
| Hints | gamedna-gameplay | Sets beyond about 20 levels | `game-mechanics` | `@gamedna/kit/events` |
| Fixed tick for timed or physical puzzles | gamedna-simulation | Real-time puzzles; turn-based boards step per move | `fixed-step-simulation` | `@gamedna/kit/loop` |
| Pushing, falling, sliding bodies | gamedna-simulation | Physics or platform puzzles only | `collision-and-response`, `character-movement` | `@gamedna/kit/collision`, `@gamedna/kit/controller` |
| Hand-made level set and difficulty curve | gamedna-world | Core | `level-design` | `@gamedna/kit/nav` |
| Generated boards | gamedna-world | Daily or endless modes only | `world-generation` | `@gamedna/kit/random` |
| Teaching order, one mechanic at a time | gamedna-experience | Core | `pacing-and-onboarding` | `@gamedna/kit/events`, `@gamedna/kit/save` |
| Distinct cell states, colorblind-safe palette | gamedna-visual | Core | `art-direction`, `procedural-assets` | `@gamedna/assets` |
| Lighting and materials for 3D boards | gamedna-visual | 3D only | `rendering-and-lighting`, `threejs-kit` | `@gamedna/kit/stage` |
| Move tweens, invalid-move shake, solve flourish | gamedna-experience | Core | `game-feel` | `@gamedna/kit/feedback` |
| Pointer, drag, keys and pad cursor | gamedna-interaction | Core | `input-and-controls` | `@gamedna/kit/input`, `@gamedna/starter` |
| Board framing, zoom | gamedna-interaction | Boards larger than the screen or 3D | `camera-systems` | `@gamedna/kit/camera` |
| Move counter, undo button, level select | gamedna-experience | Core | `hud-and-menus` | `@gamedna/starter/phaser` |
| Move, invalid and solve sounds | gamedna-experience | Core | `audio-design` | `@gamedna/assets` |
| Large-board cost | gamedna-performance | Big 3D boards only | `performance-budgets` | `@gamedna/kit/budget` |
| Solver over every level, undo properties | gamedna-quality | Core | `game-verification` | `@gamedna/core` |

## Shared contracts first

- Board coordinates: grid width and height, cell size in pixels (48 px or more so touch works), origin and axis directions.
- State as plain serializable data with a stable hash; a move is an action plus its parameters, and nothing else changes state.
- Turn model: one move per input, or a 60 Hz tick when timing or physics matters. Animation is presentation only and can be skipped.
- Actions: `select`, four directions, `undo`, `redo`, `restart`, `hint`, `pause`.
- Events: `move`, `invalid`, `undo`, `solved`, `levelStart`.
- Level format, including par move count and the mechanics each level uses.

## Dependency order

1. Contracts: state shape, move format, level format.
2. Rules with undo (gameplay) and a solver harness (quality) in parallel; their files do not overlap.
3. Levels (world) once the solver can check them; cell art (visual) at the same time.
4. Input, move tweens and HUD.
5. Teaching order once ten or more levels exist; sound; final solver and device runs.

## Genre numbers

Starting points for a first release.

- 15-40 levels built from 3-5 mechanics; each mechanic shown alone in 1-3 levels before it combines with another.
- First level solved in under 30 s; early solutions 3-6 moves, late ones 15-40.
- Move animation 100-200 ms, with the next input queued rather than dropped.
- Unlimited undo; restart back in control in under 0.5 s.
- Offer a hint after 60-120 s without progress or 3 restarts of one level.

## Acceptance

- A breadth-first solver over state hashes solves every shipped level and reports its shortest length; no level's shortest solution falls far below the intended one.
- A property test over random move sequences shows undo restores the exact previous state hash.
- Every invalid move leaves the state unchanged and emits `invalid`.
- Pointer, keyboard, gamepad and touch each complete level 1 in a browser test.
- Solved progress survives a reload through the save round trip.

## Example

None in this repository for a pure puzzle game; `apps/gravity-shift` gates exits behind keys inside a platformer.
