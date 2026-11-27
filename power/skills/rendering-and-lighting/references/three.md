# Rendering in three.js 0.170

## Contents

- Color management
- Tone mapping and exposure
- Shadows
- Materials
- Shaders
- Post-processing
- Fog and sky
- Particles and decals
- Reflections
- Disposal

## Color management

- `renderer.outputColorSpace` defaults to `THREE.SRGBColorSpace`; leave it. `THREE.ColorManagement.enabled` is on by default; leave it.
- Loaded or canvas color maps: `texture.colorSpace = THREE.SRGBColorSpace`. Data maps keep the default `THREE.NoColorSpace`. `canvasTexture(w, h, draw, { srgb: false })` for data drawn on a canvas; `proceduralSurface` already sets both correctly.
- `GLTFLoader` sets color spaces on the textures it loads. Hand-loaded `TextureLoader` textures do not.
- `new THREE.Color(0xrrggbb)`, `new THREE.Color('#rrggbb')` and `hsv(...)` are sRGB inputs. `new THREE.Color(r, g, b)` and `setRGB(r, g, b)` without a color space are linear.
- A render target that feeds a later pass stays linear and `HalfFloatType`; only the screen is sRGB.

## Tone mapping and exposure

- `renderer.toneMapping`: `ACESFilmicToneMapping` (Kit), `AgXToneMapping` or `NeutralToneMapping`. Set `renderer.toneMappingExposure` from the area's preset.
- Tone mapping applies only when drawing to the screen or in `OutputPass`. Custom `ShaderMaterial` meshes drawn directly to the screen need `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` at the end of the fragment shader, as the Kit's sky has.

## Shadows

- `createStage` uses `PCFSoftShadowMap`, a 2048 px map (1024 on `low`), a box of ±`shadowExtent`, `bias` -0.0004 and `normalBias` 0.03. Keep `near` and `far` tight around the box (Kit: 1 to 320).
- After changing `shadow.camera` bounds, call `shadow.camera.updateProjectionMatrix()`.
- `stage.render(dt, focus, ahead)` places the sun at `focus` plus the sun direction and aims it at `ahead`. Passing two different points tilts the light slightly as the player turns, and neither point is snapped. Pass one snapped point for both:

```ts
// check: compile
import * as THREE from 'three';

/** `p` moved to the nearest whole shadow-map texel across the light, so a shadow box that follows it does not shimmer. `toSun` is the unit vector toward the sun. */
export function snapToShadowTexels(p: THREE.Vector3, toSun: THREE.Vector3, texel: number): THREE.Vector3 {
  const x = new THREE.Vector3(0, 1, 0).cross(toSun).normalize();
  const y = toSun.clone().cross(x);
  const u = Math.round(p.dot(x) / texel) * texel, v = Math.round(p.dot(y) / texel) * texel;
  return x.multiplyScalar(u).addScaledVector(y, v).addScaledVector(toSun, p.dot(toSun));
}

// With createStage defaults: texel = (2 * 55) / 2048.
// const c = snapToShadowTexels(new THREE.Vector3(ahead.x, 0, ahead.z), sunDirection, (2 * 55) / 2048);
// stage.render(dt, c, c);
```

The basis matches the one the shadow camera builds with `lookAt` and the default up vector. It fails for a sun straight overhead; keep the elevation under 85°.

- Views past 200 m that need distant shadows: `CSM` from `three/addons/csm/CSM.js`, 3-4 cascades. Each cascade is another shadow render.
- Grass, decals and small debris: `castShadow = false`.

## Materials

- `MeshStandardMaterial` for nearly everything. `MeshPhysicalMaterial` only for clearcoat (car paint), sheen (cloth) or thin glass; `transmission` renders the scene again and is rarely worth it.
- Cutout foliage: `alphaTest` 0.4-0.5 instead of `transparent`, so it sorts, writes depth and casts correct shadows. Add `alphaToCoverage: true` with MSAA for smooth edges.
- Transparent objects sort per object, not per triangle. Glass gets `depthWrite: false`.
- `vertexColors: true` multiplies the map; `InstancedMesh.setColorAt` multiplies again.
- Ground decals and painted lines: `polygonOffset: true` with negative `polygonOffsetFactor` and `polygonOffsetUnits` (-2 to -5).

## Shaders

- Extend built-in materials with `onBeforeCompile` so lighting, fog and shadows keep working; `fadeTextureWithDistance` replaces `#include <map_fragment>` this way. When two materials patch differently, return a distinct string from `customProgramCacheKey()`, or they share one compiled program.
- Write a full `ShaderMaterial` only for unlit things: sky, glows, screen effects. Set `fog: false` unless the shader includes the fog chunks.

## Post-processing

- `EffectComposer` on a `WebGLRenderTarget` with `samples: 4` and `type: THREE.HalfFloatType`, then `RenderPass`, `UnrealBloomPass`, custom passes such as vignette, and `OutputPass` last. This is the Kit's order.
- `SMAAPass` when MSAA is unavailable. `GTAOPass` for ambient occlusion costs a full-screen pass at full resolution; budget it.
- Resize the composer with the renderer.

## Fog and sky

- `scene.fog = new THREE.FogExp2(horizonColor, density)`. The fog factor is `1 - exp(-(density x distance)²)`.
- Use the same sky for background and environment: `PMREMGenerator.fromScene(skyScene)`, then `scene.environment` and `scene.environmentIntensity`.

## Particles and decals

- Up to about a hundred large soft puffs: `Sprite` with `SpriteMaterial({ map, transparent: true, depthWrite: false })` from a `RingBuffer`, as in Ridgeline.
- Thousands of small sparks: one `Points` with `PointsMaterial({ size, sizeAttenuation: true, map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })`, updating a preallocated position buffer.
- Marks on the ground: an `InstancedMesh` of quads written round-robin, `frustumCulled = false` when instances move far.

## Reflections

`Reflector` from `three/addons/objects/Reflector.js` for one water plane or mirror. A `CubeCamera` at 128 px refreshed every few frames for a moving hero object; otherwise the static environment map.

## Disposal

Track what you create with `createResourceTracker` and free it with `dispose()`. `stage.dispose()` frees only what the stage made, not what you added to the scene.
