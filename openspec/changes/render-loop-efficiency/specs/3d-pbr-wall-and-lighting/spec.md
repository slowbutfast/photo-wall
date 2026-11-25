## ADDED Requirements

### Requirement: Fixed-capacity spot data texture updated via texSubImage2D
`PlaygroundPbrWall` SHALL allocate its `RGBA32F` spotlight data texture once during WebGL2 initialization at fixed capacity `MAX_SPOTS × 2` (`256 × 2`) and SHALL upload active culled fixtures `[0, count)` on each dirty draw using `gl.texSubImage2D` rather than reallocating the texture with `gl.texImage2D` on every frame.

#### Scenario: Changing visible spot count does not reallocate the spot data texture
- **WHEN** the camera pans across albums so `uSpotCount` changes from `4` to `7` across consecutive wall draws
- **THEN** `PlaygroundPbrWall` SHALL update rows `0` and `1` of the pre-allocated `MAX_SPOTS × 2` `RGBA32F` texture via `gl.texSubImage2D` with zero per-frame `gl.texImage2D` reallocations and identical visual output
