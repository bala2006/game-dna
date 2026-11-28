/**
 * GPU resource cleanup for three.js. `disposeObject3D` frees what a subtree uses; a resource
 * tracker frees everything registered with it at once. Each geometry, material, texture and
 * render target is disposed exactly once, however many objects share it. Disposal fires the
 * three.js `dispose` events the renderer listens to; nothing here touches the DOM or a GL context,
 * so it runs in Node tests. Assumes three 0.170 (`is*` flags such as `isTexture`).
 * Textures that belong to a render target (`isRenderTargetTexture`: a PMREM `scene.environment`, an
 * RT texture in a uniform or tracked directly) are never disposed here, only counted as `skipped`:
 * track or dispose the render target itself, which frees its texture and framebuffer together.
 */
import type * as THREE from 'three';

export interface DisposeCounts {
  geometries: number;
  materials: number;
  textures: number;
  renderTargets: number;
  /** Anything else with GPU state: instanced meshes, shadow-casting lights, skeletons, post passes, composers. */
  others: number;
  /** Render-target textures found and left alone: they belong to their render target. */
  skipped: number;
}

export interface DisposeOptions {
  /** Also dispose textures that materials, shader uniforms and scene backgrounds reference. Default true. */
  textures?: boolean;
  /** Resources to leave alone, such as a texture or geometry still used outside the subtree. */
  keep?: Iterable<object>;
}

interface Disposable { dispose(): void }
const flag = (x: unknown, name: string): boolean => typeof x === 'object' && x !== null && (x as Record<string, unknown>)[name] === true;
const canDispose = (x: unknown): x is Disposable => typeof x === 'object' && x !== null && typeof (x as Partial<Disposable>).dispose === 'function';

function createDisposer({ textures = true, keep = [] }: DisposeOptions) {
  const done = new Set<object>(keep), counts: DisposeCounts = { geometries: 0, materials: 0, textures: 0, renderTargets: 0, others: 0, skipped: 0 };
  const once = (x: Disposable, kind: keyof DisposeCounts) => { if (done.has(x)) return; done.add(x); x.dispose(); counts[kind]++; };
  // Disposing a render target's texture frees the GL texture but leaves its framebuffer, and breaks the target.
  const texture = (v: unknown) => {
    if (!flag(v, 'isTexture')) return;
    if (!flag(v, 'isRenderTargetTexture')) once(v as THREE.Texture, 'textures');
    else if (!done.has(v as object)) { done.add(v as object); counts.skipped++; }
  };
  const material = (m: THREE.Material) => {
    if (done.has(m)) return;
    once(m, 'materials');
    if (!textures) return;
    for (const v of Object.values(m)) texture(v);
    for (const u of Object.values((m as Partial<THREE.ShaderMaterial>).uniforms ?? {})) {
      const v: unknown = u?.value;
      if (Array.isArray(v)) v.forEach(texture);
      else texture(v);
    }
  };
  const object = (root: THREE.Object3D) => root.traverse((o) => {
    const { geometry, material: m } = o as Partial<THREE.Mesh>;
    if (flag(geometry, 'isBufferGeometry') && !flag(o, 'isSprite')) once(geometry as THREE.BufferGeometry, 'geometries');
    if (Array.isArray(m)) m.forEach(material);
    else if (flag(m, 'isMaterial')) material(m as THREE.Material);
    if (flag(o, 'isInstancedMesh') || (flag(o, 'isLight') && (o as Partial<THREE.DirectionalLight>).shadow)) once(o as unknown as Disposable, 'others');
    const skeleton = (o as Partial<THREE.SkinnedMesh>).skeleton;
    if (skeleton) once(skeleton, 'others');
    if (textures && flag(o, 'isScene')) { texture((o as THREE.Scene).background); texture((o as THREE.Scene).environment); }
  });
  const any = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(any);
    else if (flag(x, 'isObject3D')) object(x as THREE.Object3D);
    else if (flag(x, 'isMaterial')) material(x as THREE.Material);
    else if (flag(x, 'isBufferGeometry')) once(x as THREE.BufferGeometry, 'geometries');
    else if (flag(x, 'isTexture')) texture(x);
    else if (flag(x, 'isRenderTarget')) once(x as THREE.RenderTarget, 'renderTargets');
    else if (canDispose(x)) once(x, 'others');
  };
  return { counts, any };
}

/**
 * Disposes the geometries, materials (arrays too) and, by default, textures used by `root` and its
 * descendants, plus instanced-mesh buffers, light shadow maps and skeletons. Sprites keep three's
 * shared sprite geometry; render-target textures are skipped. Does not remove `root` from its
 * parent. Returns what it disposed.
 */
export function disposeObject3D(root: THREE.Object3D, options: DisposeOptions = {}): DisposeCounts {
  const d = createDisposer(options);
  d.any(root);
  return d.counts;
}

export interface ResourceTracker {
  /** Registers a geometry, material or array of them, texture, render target, Object3D subtree, or anything with `dispose()`. Returns it unchanged. */
  track<T>(resource: T): T;
  /** Forgets `resource` without disposing it. */
  untrack(resource: unknown): void;
  /** Resources registered and not yet disposed. */
  readonly size: number;
  /** Disposes every tracked resource once, in tracking order, then forgets them all. Tracked subtrees use the tracker's options. */
  dispose(): DisposeCounts;
}

/** Collects resources as they are made, `const mat = track(new MeshStandardMaterial())`, and frees them in one call. */
export function createResourceTracker(options: DisposeOptions = {}): ResourceTracker {
  const items = new Set<unknown>(), keep = [...(options.keep ?? [])];
  return {
    track(resource) {
      if (resource === null || resource === undefined) return resource;
      const known = Array.isArray(resource) || ['isObject3D', 'isMaterial', 'isBufferGeometry', 'isTexture', 'isRenderTarget'].some((f) => flag(resource, f));
      if (!known && !canDispose(resource)) throw new TypeError('track() needs a three.js resource, an Object3D or an object with dispose()');
      items.add(resource);
      return resource;
    },
    untrack(resource) { items.delete(resource); },
    get size() { return items.size; },
    dispose() {
      const d = createDisposer({ textures: options.textures ?? true, keep });
      for (const x of items) d.any(x);
      items.clear();
      return d.counts;
    },
  };
}
