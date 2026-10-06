# Fresnel Hero

A 2D browser game about stage lighting. Rig the truss, aim the lights, shape the beams — and light the band to match each performer's color goals.

**Play it:** https://cmlilley.github.io/fresnel-hero/ (GitHub Pages)

## How to play

- Each performer (singer, guitarist, drummer) gets target colors with percentage goals — the percentage of that performer's silhouette that must be lit in exactly that color. Hit every goal at once to complete the level.
- **Aim** a light by dragging the circle in the middle of its fixture.
- **Barn doors:** drag the circles on the flap tips. A closing door occludes the beam the way a real barn door does — it doesn't just narrow the cone.
- **Color:** tap a light's color dots to set it red, green, or blue. Beams mix additively where they overlap (red + green = yellow, all three = white). **Shadow** targets count the part of a performer that gets no light at all.
- **Add / remove lights:** the truss has seven fixed hang points. Tap the + circle on an empty point to hang a light, or the − circle above a fixture to take it down. Only the three lights directly above the band members are hung by default.
- **Easy:** one target color per performer (primaries, secondaries, white, and shadow). **Hard:** two or three target colors per performer, all to be met at the same time.
- Every round is solver-verified: targets are derived from a real winning rig before they're dealt, so every level can actually be completed.

Win a level and the show starts — the rig locks and the lights fade through a light-show pattern over your setup. The next round is one small button away.

## About

Fresnel Hero is a single self-contained `index.html` — no build step, no dependencies on the page itself. Just open it in a browser, or serve the repo with GitHub Pages.
