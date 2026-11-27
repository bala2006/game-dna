# Input in three.js 0.170 games

## Element and pointer lock

Pass the renderer canvas as `element` (`createInput({ element: stage.canvas, ... })`). The Kit requests pointer lock on a mouse press on that element when `look.mouse` is set, and only from that press, because browsers reject a lock request outside a user gesture. Use `mouseLook: 'drag'` for editors, strategy views and anything with clickable UI on the canvas. Say "click to look" in the hint while the lock is off, and listen for `pointerlockchange` to pause when it drops.

## Camera-relative movement

The movement axes are in camera space. `rig.update` from `@gamedna/kit/camera` returns the view `heading` each rendered frame; store it and pass it into the next tick, then rotate `(moveX, moveY)` by it inside the simulation. Trail Walk passes `cameraYaw` this way. Rotating by the live camera inside the tick couples rules to presentation, and skipping the rotation makes W walk along world +z whatever the view.

## Picking

Convert a pointer position to normalized device coordinates against the canvas rectangle, not the window: `x = (clientX - rect.left) / rect.width * 2 - 1`, `y = -((clientY - rect.top) / rect.height) * 2 + 1`. Under pointer lock, pick from the screen center `(0, 0)`. Call `raycaster.setFromCamera(ndc, camera)` against a short list of pickable meshes. Turn the result into an action payload, such as a target id, that the next tick reads; never write simulation state from the pick.

## Teardown

Call `input.dispose()` on scene teardown and on hot reload. A second `createInput` without it doubles every press and leaves two touch overlays.
