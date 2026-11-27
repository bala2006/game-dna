# Vehicles in three.js 0.170

## What `buildCar` makes

- The hull is lofted from 32-point superellipse rings every 5 cm, with separate spans over the wheel arches. The cabin is one loft with two material groups: paint and glass.
- The interior reuses the cabin geometry with a back-face headliner and an invisible glass group, so from inside you see headliner, not paint.
- Materials per car from `carMaterials({ paint, caliper })`: clearcoated paint (metalness 0.45, roughness 0.32, clearcoat 1, clearcoat roughness 0.05), tinted glass at opacity 0.62 with `depthWrite: false`, trim roughness 0.6, rubber 0.9, chrome metalness 1 and roughness 0.16, emissive head and tail lamps.
- Paint and chrome need `scene.environment`; without it they read as plastic. `createStage` provides one.
- Every car owns its geometries and materials. Remove a car with `disposeObject3D(car.root)` from `@gamedna/kit/dispose`.

## Seating a driver

Put the driver's eye on the car's eye point and parent the body to `interior`, so it rolls with the shell:

- `driver.root.position.set(lay.driverX, lay.eye.y - driver.layout.y.eye, lay.eye.z + 0.02)`.
- Seated pose through `applyPose`: hips -1.45, knees 1.25, ankles 0.1, shoulders -0.95, elbows -0.45, torso pitch -0.12 (Ridgeline Racer).
- Hide the driver's head in the cockpit view along with `setCockpitView(view, true)`.

## Wheel blur

The spokes and hub are children of each wheel's `spin` group. Above the aliasing speed, hide them and show a disc with a radial blur texture from `canvasTexture`; below it, swap back. Keep the tire and disc rim visible in both.

## Damage

- Copy the hull's rest positions once (`position.array.slice()`), so repair is a copy back.
- On an impact event, transform the hit point into the hull's local space with `hull.worldToLocal`, push vertices within the radius along the inward direction with a smooth falloff, then `position.needsUpdate = true`, `computeVertexNormals()` and `computeBoundingSphere()`. The hull has a few thousand vertices, so do this per impact, never per frame.
- Loose parts: `scene.attach(part)` keeps the world transform while reparenting, then animate the part as presentation-only debris and fade it out.
- Cracked glass: swap the glass group's material for one with a crack map from `canvasTexture`.

## Lamps

Emissive meshes read as lit lamps on their own. Add real lights only for the player car at night: two `SpotLight`s with angle 0.35-0.5 rad, penumbra 0.3-0.5 and distance 40-60 m. Each shadow-casting spotlight adds a shadow map render per frame.

## Other vehicles

Follow the same split: a spec, a pure layout function, a builder that lofts or lathes parts from the layout (`LatheGeometry` for tires, as `buildCar` does), and an animate function that reads simulation state only.
