# Requirements: Trail Walk

Trail Walk is the GameDNA Kit on-foot app: a three.js walk-and-collect game on a meadow trail. The player finds eight glowing markers, in third or first person. It is built only on `packages/kit`.

## REQ-1: Core loop and scope

**User story:** As a player, I want to explore a trail, find every marker and see my time.

1. The game SHALL show a marker count, a timer, a collect prompt near a marker, a finish card, pause and reset.
2. The terrain, trail, trees and marker places SHALL come from the `?seed=` value, and every texture SHALL be generated at runtime.

## REQ-2: Collect only within reach, on a press (COLLECT-01)

1. WHEN the player presses interact within 1.2 m of an uncollected marker THEN that marker SHALL be collected once.
2. A marker SHALL NOT be collected by standing next to it without a press, or from further away.

## REQ-3: Finish once (FINISH-01)

1. WHEN the eighth marker is collected THEN the game SHALL finish exactly once and stop the timer.

## REQ-4: Solid wall, open doorway (WALL-01)

1. The player SHALL NOT pass through the wall or the parked car, and SHALL pass through the 0.9 m doorway.

## REQ-5: Two views and every device

1. V, gamepad Y and the VIEW touch button SHALL switch between third and first person. First person SHALL hide the head and put the camera at eye height.
2. Keyboard and mouse look, gamepad and touch (move stick, look drag, JUMP, RUN, USE) SHALL each move, look, jump and collect.