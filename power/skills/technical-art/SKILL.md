---
name: technical-art
description: Phaser 2D assets with GameDNA. Style packs and deterministic sprites, tiles, backgrounds, icons, particles and sounds, with validation. Use when a 2D game needs art or sound.
---

# Technical art

Set the look first with the art-direction skill. This skill turns that look into assets.

## Step 1: Pick a style pack

Call `gd_get_style_pack` with no arguments to list packs, then with `packId` for details.

| Pack | Rendering | Camera | Motion | Feedback |
|---|---|---|---|---|
| `pixel-adventure` | Raster pixels at integer scale | Snap | Stepped, 8 fps | Square dust, tint flash |
| `neon-arcade` | Glowing vector strokes on dark | Locked | Fast cubic-out | Additive sparks, capped shake |
| `layered-minimal` | Soft vector silhouettes, depth layers | Damped | Slow sine | Soft motes, gentle squash |

Use one pack per game. Mixing packs breaks visual consistency.

## Step 2: Generate assets

`gd_generate_asset` writes the file under `public/assets/generated/` and records generator, version, seed, hash and license in `.gamedna/assets-manifest.json`.

```json
{ "projectPath": "apps/my-game", "id": "enemy-chaser", "type": "sprite", "styleId": "neon-arcade", "seed": 121, "width": 28, "height": 28, "params": { "kind": "enemy" } }
```

- Types: `sprite` (kind player, enemy, pickup; `frames` 1-8 for sheets), `tile` (solid, hazard, platform), `background` (`layers` 1-6), `icon` (key, heart, star, exit), `particles` (JSON definition), `sfx` (jump, land, hit, pickup, explosion, pulse, ui, death, win).
- The same inputs and seed give identical bytes. Change the seed to explore; keep the seed you like.
- For a repeatable pipeline, commit a script that calls `materializeAsset` (see `apps/*/scripts/generate-assets.ts`).

## Step 3: Validate

Every result includes diagnostics: dimensions, transparency, palette membership, sprite-sheet alignment and attribution. Fix every `failed` item using its `fix` text.

## Readability rules

- Value hierarchy: background lightest or darkest, play surface in the middle, actors strongest contrast. If actors blend in, lower background opacity before recoloring actors.
- Silhouettes: player, enemies and pickups must differ in shape, not only color.
- Scale: keep sprites near the hitbox size. Scale the image, never the hitbox, to fix visual size.
- Hazards: pair the hazard color with a shape cue (spikes, jagged edges).
- UI text: at least 14 px, high contrast, system fonts from the pack typography.

## Originality

Only use generated assets or assets the user authored. Do not import asset packs, copy sprites from other games, or trace existing characters. Kiro may author SVG by hand; record it in the manifest with `createdWith`.
