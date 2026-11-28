## Overview
**Status: Copy-only UI change.** There are no new components, styles, tokens or layout.

The upload card (`.admin-draft`) keeps its existing markup, classes and buttons. Only the status text in `.admin-draft-status` and the notice line change:

| Card situation | `.admin-draft-status` text |
| :--- | :--- |
| Published | `Published` |
| Auto-save or publish request in flight | `Saving…` (with U+2026) |
| Any file failed | `<n> failed` |
| Auto-saved | `Saved as draft` |
| All done, not yet auto-saved (or the auto-save failed) | `Ready to publish` |
| Uploading | `<done>/<total>` |

- **Notice after an auto-save:** `Saved <title> as draft`.
- **Notice after Publish:** `Published <title>`, unchanged.
- **Buttons:**
  - **Publish album** is `disabled` while `busy || saving`.
  - **Discard draft** is `disabled` while `discarding`.
  - Visibility rules are unchanged.

**DON'T** add buttons, CSS rules or new class names.
