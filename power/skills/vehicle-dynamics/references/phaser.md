# Vehicle dynamics in Phaser 3.90 games

## Top-down axes

`stepVehicle` runs on an XZ plane in meters. For a top-down Phaser view, map simulation `x` to screen x and simulation `z` to screen y, both times a `pixelsPerMeter` recorded in the spatial contract (8 to 16 px per meter suits a 4.3 m car at 35 to 70 px long). This is the view from above, not a mirror: positive steer, which the Kit defines as a left turn, still turns the car to its own left on screen.

- Sprite rotation for art drawn pointing right (+x): `sprite.rotation = Math.PI / 2 - heading`.
- For art drawn pointing up (-y): `sprite.rotation = Math.PI - heading`.
- Keep speeds in m/s inside the simulation. Converting the whole model to pixels makes every tuning number depend on zoom.

## Input

Phaser's left key should produce `steer = +1`, since positive steer turns left. A gamepad stick's x axis is positive to the right, so negate it, as Ridgeline Racer does with the Kit input axis.

## Arcade Physics

Do not give the car an Arcade body with `setDrag` and `setAngularVelocity` as well as `stepVehicle`; two integrators fight and the slide disappears. If walls come from Arcade static bodies, read the overlap normal and depth yourself and resolve with `bounceOffWall` in the simulation.
