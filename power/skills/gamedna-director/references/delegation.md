# Delegation packets and results

## Packet

Send this as the specialist's task, filled in, in roughly 150 to 500 tokens. Point at files instead of pasting code; the specialist reads them itself.

```yaml
task: vehicle-handling
objective: Responsive arcade driving that holds the road at 50 m/s
project: apps/harbor-run            # the app folder; profile in .gamedna/profile.json
contracts: [spatial, simulation, interaction]   # sections of src/contracts.ts that apply
owned: [src/vehicle/**, tests/vehicle/**]      # the only paths this task may write
read: [src/contracts.ts, src/track.ts]         # starting points, not a limit
interfaces:
  input: VehicleInput from @gamedna/kit/handling
  output: VehicleState consumed by src/main.ts and src/camera.ts
constraints:
  units: meters
  fixed_step_hz: 60
acceptance:
  - 0 to 100 km/h in 3 to 5 s on flat road
  - braking from top speed stops within 60 m
  - same inputs and seed give the same state (test)
```

Rules for writing one:

- One packet per system. Do not split one system across agents or send one system to two.
- `owned` must not overlap with any packet running at the same time.
- Acceptance checks are observable: a test, a measurement, a browser check. "Feels good" is not one; translate it into numbers from the specialist's skill.
- Name the interfaces that already exist and the ones the specialist must create.

## Result

Ask for this shape, in roughly 100 to 300 tokens:

```yaml
status: done | partial | blocked
changed: [src/vehicle/physics.ts, tests/vehicle/physics.test.ts]
public_api: stepCar(state, input, dt) in src/vehicle/physics.ts
decisions: [drift keeps 0.9 of lateral speed]
contract_deviations: none | what and why
verified: [npx vitest --run tests/vehicle 12 passed]
unverified: [feel on touch devices]
blockers: none | what is needed and from whom
```

No reasoning transcripts, no full file contents.

## Ordering

A dependency exists when one system needs another's interface or numbers. Give the interface first, even as a typed stub, then run the dependents in parallel.

| Before | After |
|---|---|
| Spatial scale, world units | Terrain, levels, assets, cameras |
| Vehicle or character dimensions | Collision shapes, camera mounts, animation |
| Simulation interfaces and state | Camera, HUD, audio, feedback |
| Input action names | Control code, touch layout, prompts |
| Visual contract | Materials, generated assets, effects |
| Event names | HUD, audio, game feel |

## Concurrency

- Parallel tasks need disjoint `owned` paths. Shared files (`main.ts`, `contracts.ts`, `package.json`) belong to the Director; specialists propose changes to them in their result.
- When two tasks must edit the same file, run them in sequence, or give each its own Git worktree (`git worktree add ../<task> -b <task>`) and merge the results.
- After each task run `scope-check.mjs --owned "<same globs as the packet>"`. Exit 1 lists files written outside scope.

## Reuse or start fresh

Resume the same specialist when it holds state that is expensive to rebuild: uncommitted work, a half-finished investigation, a running process. Start a fresh one for unrelated work, and for trivial follow-ups do them yourself.

## Independent review

Ask `gamedna-quality` to review when a change touches game rules, collision, saves, determinism or several systems at once. Skip it for presentation-only and one-line changes.
