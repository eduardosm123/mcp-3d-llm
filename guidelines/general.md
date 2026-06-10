# 3D modeling craft (any technology)

These rules separate a "programmer cube pile" from a model that reads as the thing it represents.

## Build order: silhouette first

1. **Block out big shapes first** (torso, hull, walls) with primitives at roughly correct proportions. Render. Does the *silhouette* read as the subject even with flat colors? If not, no amount of detail will save it.
2. **Then medium forms** (limbs, roof, wheels, handles).
3. **Then small details** (eyes, bolts, trim, antennas) — these are the difference between "a box" and "a robot", but only after the big shapes work.

## Proportions: use real-world ratios

- Pick a unit (1 unit = 1 meter) and stick to it everywhere.
- Human: ~7.5 heads tall; shoulders ~2 heads wide. Door: 1 × 2.1. Chair seat: 0.45 high. Car: ~4.5 × 1.8 × 1.4.
- Stylization changes ratios *deliberately* (toy = bigger head, shorter limbs), not accidentally.
- Measure relative to other parts ("the arm is as long as the torso"), not in absolute guesses.

## Placement: nothing floats

- Every object rests on something: ground, another object, or is attached. Gaps read as bugs.
- Compute contact from **bounding boxes** (the helpers' `anchor`/`stackY` do this), don't eyeball Y offsets.
- Parts that join (arm→shoulder) should slightly **interpenetrate** (~5–10%), never hover with a gap.
- Add a ground plane/disc under the model — it grounds the composition and gives shading contact.

## Symmetry and repetition

- Bilateral parts (arms, legs, ears, wheels, windows) must match exactly: build one side, mirror it (`mirrorX`), never hand-place both.
- Repeated elements (fence posts, windows, buttons) go in a loop with exact spacing.

## Color and material

- Use a deliberate **3-color palette**: dominant (~60%), secondary (~30%), accent (~10%).
- Vary **value** (light/dark), not only hue — value contrast is what reads at a glance.
- Avoid pure white/black and default gray; tinted neutrals look intentional.
- Different parts get different materials: glossy eyes vs matte body sells the model.

## Lighting (when the tech supports it)

- Minimum viable rig: one strong directional **key** light angled from above-front-side + soft **ambient** fill (~30%).
- Better: three-point (key + fill + rim). Rim light separates the model from the background.
- If everything renders black: lit materials with zero lights. If everything looks flat: ambient too strong relative to key.

## Detail hierarchy ("level of love")

A model feels detailed when it has 3 scales of features: big (shape), medium (panels, limbs), small (bolts, seams, highlights). Add at least a few small-scale touches where the eye lands first (face, front, top).

## Composition for the camera

- Frame the whole model with margin (auto-framing does this; or `frameCamera`).
- The three-quarter view (azimuth ~35°, elevation ~25°) is the most flattering and most diagnostic single view.
- Background: a dark, slightly tinted solid beats pure black/white.
