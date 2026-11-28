# Racing

## Player experience

Speed held at the edge of grip. The player decides where to brake, which line to take through a corner and when to risk a drift. A clean lap feels earned; a mistake costs time but never ends the run.

## Systems

| System | Owner specialist | Needed when | Skills | Kit modules |
|---|---|---|---|---|
| Fixed tick, seeded race state, pause | gamedna-simulation | Core | `fixed-step-simulation` | `@gamedna/kit/loop`, `@gamedna/kit/random` |
| Handling: throttle, brake, grip, drift, off-road limit | gamedna-simulation | Core | `vehicle-dynamics` | `@gamedna/kit/handling` |
| Barrier contact and push-out | gamedna-simulation | Core; a top-down 2D racer can use plain circle tests | `collision-and-response` | `@gamedna/kit/handling`, `@gamedna/kit/collision` |
| Centerline spline, road ribbon, banks, scatter | gamedna-world | Core; a flat stylized track keeps only the spline | `world-generation` | `@gamedna/kit/world` |
| Checkpoint placement, corner sightlines, landmarks | gamedna-world | Core | `level-design` | `@gamedna/kit/world` |
| Countdown, checkpoints, laps, best time | gamedna-gameplay | Core | `game-mechanics`, `game-architecture` | `@gamedna/kit/fsm`, `@gamedna/kit/events` |
| Rival cars on a racing line | gamedna-gameplay | Races against opponents; time trial drops it | `enemy-ai` | `@gamedna/kit/steering` |
| Car body, wheel spin and steer, roll, brake lights | gamedna-motion | Core in 3D; a 2D sprite car needs only a turn | `vehicle-design` | `@gamedna/kit/vehicle` |
| Driver in the cockpit, trackside marshals | gamedna-motion | Cockpit view or people for scale | `character-animation` | `@gamedna/kit/character` |
| Look sheet, palette, scale cues | gamedna-visual | Core | `art-direction` | `@gamedna/assets` |
| Sky, sun, shadows, fog, road and paint materials | gamedna-visual | 3D builds | `rendering-and-lighting`, `threejs-kit` | `@gamedna/kit/stage` |
| Skid marks and tire smoke from slip | gamedna-visual | Optional for a small build | `rendering-and-lighting` | `@gamedna/kit/pool` |
| Steering, pedals and view button on every device | gamedna-interaction | Core | `input-and-controls` | `@gamedna/kit/input` |
| Chase, far chase, hood and cockpit views | gamedna-interaction | Core; a small build ships the chase view alone | `camera-systems` | `@gamedna/kit/camera` |
| Barrier impact and speed sensation | gamedna-experience | Core | `game-feel` | `@gamedna/kit/feedback` |
| Lap, time, speed HUD; countdown and results | gamedna-experience | Core | `hud-and-menus` | `@gamedna/kit/input` |
| Engine pitch from rpm, tire squeal, hits | gamedna-experience | Core; one engine loop is enough to start | `audio-design` | `@gamedna/kit/loop` |
| Scatter instancing, draw calls, disposal | gamedna-performance | Dense scenery or phone targets | `performance-budgets` | `@gamedna/kit/budget`, `@gamedna/kit/dispose` |
| Auto-driver, lap scenarios, view screenshots | gamedna-quality | Core | `game-verification` | `@gamedna/core` |

## Shared contracts first

- Spatial: meters, +y up, +z forward, XZ ground. Scales: car length 4.0-4.9 m (Ridgeline 4.3), road width 12-15 m, driver 1.75 m.
- Simulation: 60 Hz, at most 5 steps per frame, update order input, vehicle, barriers, race. The vehicle step alone writes car position and velocity.
- Track data: closed centerline points, road width, checkpoint indices along the line. The sim and the scenery both take it from one module.
- Actions: `steer`, `throttle`, `brake` as axes; `drift`, `camera`, `reset`, `pause` as buttons; `look` for mouse and right stick. These match `BINDINGS.driving`.
- Events: `notice`, `hit` with power 0..1, `lap`, `finish`. Slip is a per-tick readout in state, not an event.
- Budgets: 60 fps at p95, 2 ms of simulation per frame, 300-400 draw calls on an integrated laptop GPU.

## Dependency order

1. Contracts, then the track data module, because handling tests, scenery and checkpoints all need the centerline.
2. Handling against the track (simulation) while the car model (motion) and look sheet (visual) proceed in their own files.
3. Race rules on top of handling; the auto-driver comes right after so later work is tested by laps.
4. Terrain and scatter (world, visual), input and cameras (interaction) in parallel once track and car mounts exist.
5. HUD, audio and feel once the event names are live; performance pass with full scatter; verification last.

## Genre numbers

Starting points for an arcade circuit racer; record the chosen values in the tuning file.

- Top speed 45-60 m/s (Ridgeline 52). 0-100 km/h in 3-5 s; Ridgeline is quicker at about 2.2 s. Braking 30-40 m/s².
- Off-road speed limit near 40 percent of top speed (Ridgeline 20 m/s), so a mistake slows the car instead of stopping it.
- Road 12-15 m wide, curbs 1-1.5 m, barriers 5-8 m past the edge, flat run-off 5-10 m beyond the barriers.
- Three laps of 60-120 s each; a 3 s countdown (180 ticks) with input ignored.
- Three or more checkpoints per lap, spaced so none can be skipped by cutting across terrain.
- A landmark every 10-20 s of driving, roughly every 300-600 m at racing speed.
- Chase FOV about 60 at rest widening to about 74 at top speed; look input recenters after about 1 s.

## Acceptance

- An automatic driver, enabled by `?auto` or a scenario, finishes three laps from a fixed seed inside a planned time band.
- A scenario that skips a checkpoint or crosses the line backwards never advances the lap; a barrier hit never moves the car forward along the track.
- Each camera view has a reviewed screenshot at speed with no clipping into the body, the road or terrain.
- Keyboard, gamepad and touch each steer, accelerate and brake in a browser test; a tap shorter than one tick still cycles the view.
- `measureCar` reports the body within 2 percent of its preset, and p95 frame time holds with full scatter on the target class.

## Example

`apps/ridgeline-racer`: a three.js 0.170 circuit racer built only on the Kit, with an `?auto` driver.
