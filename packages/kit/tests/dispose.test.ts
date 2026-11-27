import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createResourceTracker, disposeObject3D } from '../src/dispose.js';

/** Counts three.js `dispose` events per resource, the signal WebGLRenderer frees GPU memory on. */
const counter = () => {
  const calls = new Map<THREE.EventDispatcher<{ dispose: object }>, number>();
  const watch = <T extends THREE.EventDispatcher<{ dispose: object }>>(x: T): T => {
    calls.set(x, 0);
    x.addEventListener('dispose', () => calls.set(x, (calls.get(x) ?? 0) + 1));
    return x;
  };
  return { watch, calls: (x: THREE.EventDispatcher<{ dispose: object }>) => calls.get(x), all: () => [...calls.values()] };
};

const texture = () => new THREE.DataTexture(new Uint8Array(4), 1, 1);

describe('disposeObject3D', () => {
  it('disposes shared geometries, materials and textures exactly once, across mesh, line, points, sprite and instanced mesh', () => {
    const c = counter();
    const map = c.watch(texture()), normal = c.watch(texture()), env = c.watch(texture()), sprite = c.watch(texture()), uniform = c.watch(texture());
    const shared = c.watch(new THREE.MeshStandardMaterial({ map, normalMap: normal, envMap: env }));
    const second = c.watch(new THREE.MeshPhysicalMaterial({ map, roughnessMap: map, clearcoatNormalMap: normal }));
    const shader = c.watch(new THREE.ShaderMaterial({ uniforms: { a: { value: uniform }, list: { value: [env, uniform] } } }));
    const box = c.watch(new THREE.BoxGeometry()), lineGeo = c.watch(new THREE.BufferGeometry()), pointGeo = c.watch(new THREE.BufferGeometry());
    const lineMat = c.watch(new THREE.LineBasicMaterial()), pointMat = c.watch(new THREE.PointsMaterial({ map: sprite }));
    const spriteMat = c.watch(new THREE.SpriteMaterial({ map: sprite }));
    const root = new THREE.Group(), child = new THREE.Group();
    const instanced = c.watch(new THREE.InstancedMesh(box, shared, 4));
    const spr = new THREE.Sprite(spriteMat);
    let spriteGeometryDisposed = 0;
    spr.geometry.addEventListener('dispose', () => spriteGeometryDisposed++);
    root.add(new THREE.Mesh(box, shared), new THREE.Mesh(box, [shared, second, shader]), child);
    child.add(new THREE.Line(lineGeo, lineMat), new THREE.Points(pointGeo, pointMat), spr, instanced, new THREE.Mesh(box, second));

    const counts = disposeObject3D(root);
    expect(c.all().every((n) => n === 1), JSON.stringify(c.all())).toBe(true);
    expect(counts).toEqual({ geometries: 3, materials: 6, textures: 5, renderTargets: 0, others: 1, skipped: 0 });
    expect(spriteGeometryDisposed).toBe(0);
  });

  it('leaves textures when asked, and never touches kept resources', () => {
    const c = counter();
    const map = c.watch(texture()), kept = c.watch(texture()), geo = c.watch(new THREE.PlaneGeometry());
    const mat = c.watch(new THREE.MeshBasicMaterial({ map, alphaMap: kept }));
    const mesh = new THREE.Mesh(geo, mat);
    expect(disposeObject3D(mesh, { textures: false })).toMatchObject({ geometries: 1, materials: 1, textures: 0 });
    expect(c.calls(map)).toBe(0);
    const again = new THREE.Mesh(c.watch(new THREE.PlaneGeometry()), c.watch(new THREE.MeshBasicMaterial({ map, alphaMap: kept })));
    expect(disposeObject3D(again, { keep: [kept, again.geometry] })).toMatchObject({ geometries: 0, materials: 1, textures: 1 });
    expect(c.calls(kept)).toBe(0);
    expect(c.calls(again.geometry)).toBe(0);
    expect(c.calls(map)).toBe(1);
  });

  it('frees a scene background and environment, and shadow-casting lights', () => {
    const scene = new THREE.Scene(), bg = texture(), sun = new THREE.DirectionalLight();
    scene.background = bg;
    scene.environment = bg;
    scene.add(sun, new THREE.AmbientLight());
    let shadowDisposed = 0;
    sun.shadow.dispose = () => { shadowDisposed++; };
    expect(disposeObject3D(scene)).toMatchObject({ textures: 1, others: 1 });
    expect(shadowDisposed).toBe(1);
  });

  it('skips render-target textures in scene environments, materials and uniforms, and leaves the target to its owner', () => {
    const c = counter(), pmrem = c.watch(new THREE.WebGLRenderTarget(8, 8)), rt = c.watch(new THREE.WebGLRenderTarget(4, 4));
    const envTex = c.watch(pmrem.texture), rtTex = c.watch(rt.texture), plain = c.watch(texture());
    expect([envTex.isRenderTargetTexture, rtTex.isRenderTargetTexture, plain.isRenderTargetTexture]).toEqual([true, true, false]);
    const scene = new THREE.Scene();
    scene.environment = envTex;
    scene.background = envTex;
    const shader = c.watch(new THREE.ShaderMaterial({ uniforms: { last: { value: rtTex }, both: { value: [rtTex, plain] } } }));
    scene.add(new THREE.Mesh(c.watch(new THREE.PlaneGeometry()), [c.watch(new THREE.MeshStandardMaterial({ envMap: envTex, map: plain })), shader]));
    expect(disposeObject3D(scene)).toEqual({ geometries: 1, materials: 2, textures: 1, renderTargets: 0, others: 0, skipped: 2 });
    expect([c.calls(envTex), c.calls(rtTex), c.calls(pmrem), c.calls(rt), c.calls(plain)]).toEqual([0, 0, 0, 0, 1]);
    const tracker = createResourceTracker();
    tracker.track(rtTex);
    tracker.track(rt);
    expect(tracker.dispose()).toMatchObject({ textures: 0, renderTargets: 1, skipped: 1 });
    expect([c.calls(rt), c.calls(rtTex)]).toEqual([1, 0]);
  });
});

describe('resource tracker', () => {
  it('returns what it tracks and disposes everything once, then forgets it', () => {
    const c = counter(), tracker = createResourceTracker();
    const geo = tracker.track(c.watch(new THREE.SphereGeometry()));
    const tex = tracker.track(c.watch(texture()));
    const mat = tracker.track(c.watch(new THREE.MeshLambertMaterial({ map: tex })));
    const pair = tracker.track([c.watch(new THREE.MeshBasicMaterial()), mat]);
    const target = tracker.track(c.watch(new THREE.WebGLRenderTarget(4, 4)));
    const mesh = tracker.track(new THREE.Mesh(geo, mat));
    tracker.track(mesh);
    let other = 0;
    const custom = tracker.track({ dispose: () => { other++; } });
    expect(tracker.track(null)).toBeNull();
    expect(mesh.geometry).toBe(geo);
    expect(pair).toHaveLength(2);
    expect(target.width).toBe(4);
    expect(custom.dispose).toBeTypeOf('function');
    expect(tracker.size).toBe(7);

    expect(tracker.dispose()).toEqual({ geometries: 1, materials: 2, textures: 1, renderTargets: 1, others: 1, skipped: 0 });
    expect(c.all().every((n) => n === 1), JSON.stringify(c.all())).toBe(true);
    expect(other).toBe(1);
    expect(tracker.size).toBe(0);
    expect(tracker.dispose()).toEqual({ geometries: 0, materials: 0, textures: 0, renderTargets: 0, others: 0, skipped: 0 });
  });

  it('untracks, honors keep, and rejects things that cannot be disposed', () => {
    const c = counter(), shared = c.watch(texture()), tracker = createResourceTracker({ keep: [shared] });
    const geo = tracker.track(c.watch(new THREE.BoxGeometry()));
    tracker.track(new THREE.Sprite(c.watch(new THREE.SpriteMaterial({ map: shared }))));
    tracker.untrack(geo);
    expect(tracker.dispose()).toMatchObject({ geometries: 0, materials: 1, textures: 0 });
    expect(c.calls(geo)).toBe(0);
    expect(c.calls(shared)).toBe(0);
    expect(() => tracker.track(new THREE.Vector3())).toThrow(TypeError);
  });

  it('frees what a three.js stage allocates: sky mesh, environment target, shadow light, post passes', () => {
    // createStage needs WebGL, so this mirrors its dispose path with the same object types in Node.
    const c = counter(), { track, dispose } = createResourceTracker();
    const skyMaterial = c.watch(new THREE.ShaderMaterial({ uniforms: { zenith: { value: new THREE.Color() } } }));
    const skyGeo = c.watch(new THREE.SphereGeometry(10, 8, 4)), envGeo = c.watch(new THREE.SphereGeometry(5, 8, 4));
    track(new THREE.Mesh(skyGeo, skyMaterial));
    const envScene = track(new THREE.Scene());
    envScene.add(new THREE.Mesh(envGeo, skyMaterial));
    const env = track(c.watch(new THREE.WebGLRenderTarget(8, 8)));
    const sun = track(new THREE.DirectionalLight());
    sun.shadow.map = c.watch(new THREE.WebGLRenderTarget(8, 8));
    let passes = 0;
    for (let i = 0; i < 3; i++) track({ dispose: () => { passes++; } });
    expect(dispose()).toEqual({ geometries: 2, materials: 1, textures: 0, renderTargets: 1, others: 4, skipped: 0 });
    expect(c.all().every((n) => n === 1), JSON.stringify(c.all())).toBe(true);
    expect(c.calls(env)).toBe(1);
    expect(passes).toBe(3);
  });
});
