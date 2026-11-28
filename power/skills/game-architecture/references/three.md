# Game architecture in three.js 0.170 games

## A level is one group

three.js has no scene lifecycle, so the game supplies one. Build each level under a single `THREE.Group` added to `stage.scene`. To leave it, remove the group and call `disposeObject3D(group, { keep: shared })` from `@gamedna/kit/dispose`, where `shared` lists materials and textures that other levels still use. Alternatively register everything the level creates with `createResourceTracker().track(...)` and call `dispose()` once.

- Removing a group without disposing it leaks GPU memory; disposing a shared material breaks the next level's meshes until they are rebuilt.
- After a restart, `renderer.info.memory.geometries` and `renderer.info.memory.textures` return to their values before the level. A count that climbs with each restart is a leak.
- Leaving the game for good: `input.dispose()`, the `stop()` returned by `runFixedStep`, then `stage.dispose()`.

## Records to objects

- The simulation holds records with ids; `render` keeps a `Map<number, THREE.Object3D>`. Each frame, create views for new ids, update the rest and remove views whose ids are gone, or drive creation and removal from spawn and death events.
- `userData` may carry an id for picking. It never holds the truth about health, position or state.
- Skinned models cloned with `object.clone()` share one skeleton and animate together or break. Use `clone` from `three/addons/utils/SkeletonUtils.js`.

## Loading

- `new GLTFLoader().loadAsync(url)` from `three/addons/loaders/GLTFLoader.js` and `new THREE.TextureLoader().loadAsync(url)` return promises; await all of them in a loading phase before the first tick.
- A shared `THREE.LoadingManager` passed to every loader reports `onProgress(url, loaded, total)` for a progress bar and `onError(url)` for a fallback.
- The simulation receives parsed data (collision boxes, spawn points) from the same layout records that place meshes, never sizes measured from loaded models.
