# Look development in three.js 0.170

Tune the look in one small scene with known references, then apply the settings to the game. Changing values inside the full game hides whether a change came from the material, the light or the content.

## The scene

- A `createStage` with the game's sun direction, sky colors, exposure and fog. Keep exposure fixed while judging colors.
- Scale references: `buildHumanoid(humanoidLayout({ height: 1.75 }))`, `buildCar({ preset: 'sedan' })` and a 0.9 x 2.1 m door frame.
- A grey sphere at 18% reflectance, `color: 0x777777`, roughness 0.5: hex values are sRGB, and 0x77 decodes to about 0.18 linear. On its sunlit side under midday sun and the Kit's default exposure, it should land near the middle of the brightness range; far from it, the exposure or sun intensity is off.
- A white sphere at sRGB 0xe0 (fresh paint, about 0.75 linear) to check that highlights do not clip.
- A chrome sphere (metalness 1, roughness 0.05) to show what the environment reflects.
- One patch each of the game's 4-6 materials, and the ground material with its real texture repeat.

## Matching the sheet

1. Render the scene at the game's resolution and measure it with the ffmpeg recipe in the skill body.
2. Adjust light intensity and exposure until the grey sphere and the ground land where the key wants them.
3. Only then adjust material colors. A color that looks wrong under a wrong exposure gets "fixed" twice.
4. Save the light preset and material values as data the game imports, not as numbers copied into scene code.

## Colors in three.js

- Palette hex strings and `hsv` from `@gamedna/kit/stage` are sRGB and convert correctly. `new THREE.Color(r, g, b)` with numbers takes linear values, so 0.5 there is much brighter than 0.5 in a color picker.
- Vertex colors and `setColorAt` take `THREE.Color` objects, so build them from hex or `hsv` too.
- Canvas drawing uses sRGB CSS colors; `canvasTexture` marks the result as sRGB by default.

## Screenshots

Capture with `renderer.domElement.toDataURL('image/png')` in the same task as `stage.render`, because the stage's renderer does not preserve its drawing buffer, or with a Playwright screenshot through the game's dev hook. Use the same viewport for every capture you compare.
