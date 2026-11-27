# Vehicles in Phaser 3.90

## Top-down

- Draw cars at the world's pixels per meter: at 27 px/m a 4.78 m sedan is 129 px long and 50 px wide.
- Rotate around the middle of the wheelbase, not the sprite's center. For a sprite drawn nose-up, `setOrigin(0.5, (frontOverhang + wheelbase / 2) / length)`: 0.49 for the sedan preset.
- Suggest body roll with a separate shadow sprite offset 1-3 px away from the turn and a 1-2% squash across the car.
- Front wheels as two small child images in a `Container` with the body, rotated by the steering angle, read well at 60 px and longer.

## Side view

- Wheels as separate images rotated by distance / radius in pixels every frame; the body as an image that bobs on a spring 1-3 px above them.
- Pitch the body a few degrees on braking and acceleration, around the point between the axles.

## Damage

- Swap the body frame through 3-4 tiers (clean, scuffed, dented, wrecked) at damage thresholds from the simulation.
- On impact, tint the body white for 2-3 frames and puff dust with a particle burst.
- Loose parts become separate images with their own tween, outside the car's container.

## Tire marks

Stamp short dark marks into a `RenderTexture` the size of the track with `draw(markImage, x, y)`, so thousands of marks cost one draw. Fade the whole texture slowly or clear it per lap.
