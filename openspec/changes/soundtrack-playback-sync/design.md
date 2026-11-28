## Overview
**Status: Non-visual / Behavioural change.**

No components, layout, colours or typography change. The placard timecode keeps its existing `M:SS / M:SS` text, `tabular-nums` styling and position. What changes is the value it shows:

| Player situation | Timecode shows |
| :--- | :--- |
| Facade (no player) | `0:00 / 3:25` (unchanged) |
| Player mounted, unstarted / cued / buffering before first play | `0:00 / 3:25` |
| Playing | the player's position, advancing once a second |
| Paused or buffering mid-track | frozen at the last position |
| Ended | the last position, at most the duration |
| Bridge unavailable | wall clock from the fallback moment (today's behaviour) |

The capture layer (`.soundtrack-capture-layer`) keeps its existing styling. When autoplay is refused it's simply removed sooner. No new hint, toast or CSS.

**DON'T** add CSS, transitions or new DOM for this change.
