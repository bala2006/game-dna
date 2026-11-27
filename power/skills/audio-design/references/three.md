# Audio in three.js 0.170 games

## Listener and context

`new THREE.AudioListener()` creates or reuses the shared context from `THREE.AudioContext.getContext()`. Create the listener at startup, add it to the camera, and resume `listener.context` from a gesture handler; three.js does not unlock audio for you. For third-person games, add the listener to an empty `Object3D` instead, copy the character's position and the camera's quaternion into it each frame, so sounds do not swing as the camera orbits.

`listener.setMasterVolume(v)` sets the master gain, and `listener.setFilter(limiter)` inserts a `DynamicsCompressorNode` between it and the output. Category buses are gain nodes connected to `listener.getInput()`; call `disconnect()` on each sound's `getOutput()` once after creating it, then connect that output to its bus.

## Positional sounds

```ts
const engine = new THREE.PositionalAudio(listener);
engine.setBuffer(buffer);
engine.setRefDistance(4);
engine.setRolloffFactor(1);
engine.setDistanceModel('inverse');
engine.setLoop(true);
carRoot.add(engine);
```

`PositionalAudio` defaults its panner to HRTF, which costs CPU per source. Set `engine.panner.panningModel = 'equalpower'` for crowds, traffic and anything past about 16 sources. For non-positional effects and music use `THREE.Audio`.

## Generated buffers

`synthesizeSfx` from `@gamedna/assets` returns WAV bytes. Decode them with `listener.context.decodeAudioData(bytes.slice().buffer)`; decoding detaches the buffer it receives, so pass a copy if the bytes are reused. Decode once at load and keep the `AudioBuffer`s; a buffer can feed any number of sources.

## Procedural loops

Ridgeline Racer's engine is two detuned oscillators through a low-pass filter whose frequency and gain follow RPM with `setTargetAtTime` time constants of 50 to 80 ms. Updating them from `render` is fine, because audio parameters are smoothed on the audio thread.
