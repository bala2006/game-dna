# Requirements: Ridgeline Racer

Ridgeline Racer is the GameDNA Kit driving app: a three.js circuit racer on a seeded track through hills and forest. The player drives a coupe for three laps against the clock. It is built only on `packages/kit`.

## REQ-1: Core loop and scope

**User story:** As a player, I want to race three laps on a fresh circuit and see my lap times.

1. The game SHALL have a 3-second countdown, three laps, lap and best-lap times, a finish card, pause, reset and a new-track key.
2. The track, terrain, trees and paint SHALL come from the `?seed=` value, and every texture and sound SHALL be generated at runtime.
3. WHEN `?auto=1` is set THEN an automatic driver SHALL drive the car.

## REQ-2: A lap counts only after every checkpoint (LAP-01)

1. WHEN the car crosses the start line without passing both checkpoints in order THEN the lap SHALL NOT count.

## REQ-3: Reset never moves the car forward (RESET-01)

1. WHEN the player resets THEN the car SHALL return to the start grid and the race SHALL restart its countdown.

## REQ-4: Barriers hold the car (WALL-01)

1. WHILE the car drives THE car SHALL stay inside the barriers, which push it back and cost speed.

## REQ-5: Every view and every device

1. The C key, gamepad Y and the CAM touch button SHALL cycle Chase, Chase far, Hood and Cockpit.
2. Keyboard, mouse look, gamepad and touch (stick plus GAS and BRAKE pedals) SHALL each drive the car.