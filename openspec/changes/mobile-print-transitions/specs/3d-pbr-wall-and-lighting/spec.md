## ADDED Requirements

### Requirement: Coarse-pointer wall dither against spotlight banding
On `(pointer: coarse)` devices, the `PlaygroundPbrWall` fragment shader SHALL add interleaved-gradient-noise dither of amplitude `±0.5 / 255` per channel to the final colour, after the filmic curve and before output:

`(fract(52.9829189 · fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) − 0.5) / 255`

This breaks up 8-bit banding in the spotlight pools at the capped `1.0` DPR. It SHALL be gated by a `uDither` uniform: `1.0` on coarse pointers and `0.0` on fine pointers, so desktop output stays bit-identical.

#### Scenario: Coarse wall output is dithered, desktop is untouched
- **WHEN** `PlaygroundPbrWall` renders on a coarse-pointer device versus a fine-pointer desktop
- **THEN** `uDither` SHALL be `1.0` on the coarse device and `0.0` on desktop, and desktop wall screenshots SHALL have `0` differing pixels against `main`

#### Scenario: Dither amplitude stays below one 8-bit step
- **WHEN** the dither term is evaluated over any pixel coordinate
- **THEN** its magnitude SHALL NOT exceed `0.5 / 255`
