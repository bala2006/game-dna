# three.js version notes

Every statement below was checked against the installed `three` 0.170.0 source and `@types/three` 0.170.0 typings.

## Checking an installed version

1. `npm ls three @types/three`: one copy of each, same release. A typings release that differs from the runtime release gives false compile errors or false passes.
2. Read the profile's `engine.version` and `engine.support`. For `untested-version`, open `node_modules/three/package.json` and the matching `@types/three`, then grep the typings for each API in the table below before using it.
3. Read the three.js release notes and migration guide for every release between 0.170 and the installed one, and list each change that touches the Kit's APIs.
4. Run `npm run typecheck` and the browser tests. Report the version, what was checked, and what was not.

Never change the pinned version to make an error go away. A version change needs the user's authorization and a run of every test.

## APIs the Kit relies on

| API | Used by | Note in 0.170 |
|---|---|---|
| `WebGLRenderer` | `createStage` | WebGL 2 only; the renderer throws on WebGL 1 since r163 |
| `renderer.outputColorSpace`, `texture.colorSpace` | stage, textures | The color-space API that replaced the removed `encoding` properties; output defaults to `SRGBColorSpace` |
| `THREE.ColorManagement.enabled` | everything | `true` by default: hex and CSS colors are treated as sRGB and converted to linear |
| `#include <tonemapping_fragment>`, `#include <colorspace_fragment>` | stage sky shader | Chunk names in 0.170; `encodings_fragment` no longer exists |
| `scene.environment`, `scene.environmentIntensity` | stage | Environment lighting strength set on the scene |
| `PMREMGenerator.fromScene` | stage | Builds the sky-lit environment map |
| `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `ShaderPass`, `OutputPass` | stage at `high` | From `three/addons/postprocessing/*.js`; `OutputPass` applies tone mapping and color space, so the passes before it work in linear |
| `PCFSoftShadowMap`, `ACESFilmicToneMapping` | stage | Defaults the stage sets |
| `InstancedMesh`, `BatchedMesh` (`addGeometry`, `addInstance`) | scenery | `addInstance` is how `BatchedMesh` places copies in 0.170 |
| `mergeGeometries` | scenery | From `three/addons/utils/BufferGeometryUtils.js`; the older `mergeBufferGeometries` name is gone |
| `renderer.compileAsync` | loading | Present in 0.170 |
| `Loader.loadAsync`, `GLTFLoader.setDRACOLoader`, `setKTX2Loader`, `setMeshoptDecoder` | assets | Promise loading and decoder hooks |

## Gone before 0.170

The validator rejects these in samples, and the installed source no longer contains them: `THREE.Geometry`, `Face3`, `renderer.outputEncoding`, `texture.encoding`, `sRGBEncoding`, `physicallyCorrectLights`, `useLegacyLights`, `WebGL1Renderer`, `mergeBufferGeometries`, `renderer.gammaFactor`. Lighting is physically based in every case, so light intensities from old tutorials are usually too low.

## Present but not used by GameDNA

- `three/webgpu` and `three/tsl` exports, and `WebGPURenderer`. The Kit's sky is a GLSL `ShaderMaterial` and its post-processing is `EffectComposer`, neither of which runs on the WebGPU node system.
- `renderer.setAnimationLoop`. The Kit drives frames with `runFixedStep`; WebXR, which needs `setAnimationLoop`, is not covered.
