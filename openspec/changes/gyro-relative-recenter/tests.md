## Automated Tests

Runner: `npx vitest run` (Node environment). For narrow loops, run the specific file.

- `npx vitest run src/components/wall/__tests__/gyroTilt.test.ts`: the pure maths.
  - **Existing 15 tests stay green unchanged.** No `alpha` means the Euler fallback, which proves it equals the old code.
  - **Single-axis equivalence:** with a shared finite `alpha`, pure `Δβ` and pure `Δγ` on the matrix path match the Euler path for `relativeDeviceTilt` (within `1e-6°`) and for `computeGyroTilt` output at every screen angle `0/90/180/270`.
  - **Gimbal crossing:** baseline `(0, 50, 80)` against the equivalent-triple sample `(180, 130, −5)` gives `aboutY ≈ 15`, `aboutX ≈ 0`, and the emitted tilt doesn't saturate. The same input through the Euler path saturates, which documents the bug.
  - **Equivalent triples:** `(α, β, γ)` and `(α+180, 180−β, γ+180)`, normalized, give identical tilt against several baselines.
  - **Upright portrait:** baseline `β = 89`. A physical +10° rotation about device x (sample built as `R_base · Rx(10°)`, then converted to a W3C triple) gives `aboutX ≈ 10`, `aboutY ≈ 0`.
  - **In-plane twist:** `R_base · Rz(θ)` for `θ ∈ {±30°, ±90°}` gives both angles ≈ 0.
  - **Null `alpha`:** a null `alpha` on either side uses the Euler path, bit-identical to the old `computeGyroTilt`.
  - **Signs:** `noNegativeZero` and the clamp at ±22° still hold on the matrix path.
- `npx vitest run src/components/wall/__tests__/useGyroTilt.test.ts`: the controller. The fake adapter gains a manual timer queue. Existing tests stay green, and their only edit is the fake's new `setTimer`/`clearTimer`.
  - **The reading shape:** `alpha` is forwarded, and a reading with `alpha: null` and finite `β/γ` is accepted, not ignored.
  - **Recentre after stillness:** tilt +10° about x, then hold within 1.5° and advance 3000 ms. The timer fires and the baseline becomes the last reading. Over the following rAF frames the emitted `ny` decreases monotonically toward 0. It's about 37% of the start value (±5%) after 450 ms of frames, and exactly `{0,0}` is emitted on settle.
  - **No snap:** the first emit after the recentre is close to the pre-recentre value, not `{0,0}`.
  - **Motion prevents recentre:** band breaks every 2000 ms over 10 s mean the timer never fires and there's no glide.
  - **Glide without events:** after the recentre, no further readings are pushed. rAF frames alone carry it to settled, after which no further frames are requested.
  - **Interrupted glide:** a > 1.5° reading mid-glide ends the glide, the next smoothing step uses the 85 ms tau (compared against `smoothTilt` with the default tau), and the timer re-arms.
  - **One recentre per still period:** after the recentre, holding still for 9000 ms fires no second recentre. After a band break and another 3000 ms, it fires again.
  - **Context cancellation:** each of leaving `print`, a focus change, a screen-orientation change and `destroy()` clears the timer, stops glide frames, and fires no later recentre.
  - **Never-streaming device:** entering Print Focus with no readings arms no timer and emits nothing.
  - **Unclamped band:** a pose held at 30° (beyond the ±22° clamp) still counts as still and recentres. Sweeping between 25° and 40° (saturated output) counts as motion.
- `npx vitest run src/components/wall/__tests__/printSharpOverlaySync.test.ts src/lib/__tests__/touchAudit.test.ts src/lib/__tests__/sheenGlareAudit.test.ts`: stay green unchanged.
- **Full gates:** `npx vitest run` (serialized full suite), `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- **Desktop parity:** the fine-pointer path is untouched by construction (the controller is never capable on `pointer: fine`). Run the existing desktop computed-style and pixel harness for idle, print and hovered print. Expect 0 px difference.

## Manual Verification

Local dev on the LAN (`next dev -H 0.0.0.0`, local DB, `STORAGE_DRIVER=local`) or read-only viewing of the preview. Use a real iPhone (Safari) and a real Android phone (Chrome). Temporarily log `event.alpha`, the event timestamps and the device-frame tilt to the console via a local-only debug line that isn't committed.

- **`alpha` availability:**
  - **WHEN** you enter Print Focus on each device
  - **THEN** record whether `alpha` is finite on every event, and the event cadence while you hold the phone still
- **Landscape hold:**
  - **WHEN** you rotate the phone to landscape, hold it at a natural 50–70°, enter Print Focus, and tilt slowly ±20° in each direction
  - **THEN** the frame and glare move smoothly and proportionally, with no corner slam or jump, in the same directions as portrait
- **Upright portrait / lying down:**
  - **WHEN** you hold the phone nearly vertical (or lie on your side), enter Print Focus, and tilt and twist
  - **THEN** tilting moves the print, twisting the phone in its own plane doesn't, and there's no jitter
- **Recentre feel:**
  - **WHEN** you tilt about 10°, then hold still
  - **THEN** after about 3 s the print and glare ease back to rest over about 1.3 s with no snap. Record whether 1.5° and 3 s fire reliably in a natural hold. Tune `RECENTER_STILL_BAND_DEG` only if it clearly doesn't.
- **Active viewing:**
  - **WHEN** you keep gently moving the phone to study the glare for 15 s
  - **THEN** no recentre happens
- **Interruption:**
  - **WHEN** you move the phone during a glide
  - **THEN** the print follows your hand immediately
- **Regression:**
  - **WHEN** you rotate the screen while in Print Focus, enable Reduce Motion, or deny the motion permission
  - **THEN** the behaviour matches the current production build. Check desktop hover once to confirm it's unchanged.
