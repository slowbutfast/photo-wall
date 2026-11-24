## Overview
**Status: Non-visual / Client-pipeline change.**
No new visual components, layout changes, or CSS tokens are introduced.

Per-file preparation/compression errors and actionable `HTTP 413` messages render through the existing `DraftFile.error` slot (`.admin-error` / `.admin-draft-status` in `FolderDropzone.tsx`), preserving the existing Curator Drawer typography and contrast tokens from `globals.css`.
