# Overwatch development rules

- Keep all inventory changes behind explicit operator approval.
- Batch approval is atomic and requires an explicit reviewed item list. Duplicate product IDs within a batch give a red error. Verification rescans remain allowed.
- Receipt approval is idempotent. Never increment stock on each video frame.
- A product scan creates a draft only. Shelf + item verification and a final operator confirmation move the approved receipt to a shelf.
- Do not fabricate product details, camera observations, positions, robot activity, or safety guarantees.
- Navigation is based on observed checkpoint labels and the configured graph. There is no continuous AR localization.
- Label manual entry and operator reports honestly in the UI and audit trail.
- OpenAI credentials stay in server-side environment variables. Never bundle .env or data/ in releases.
- Obstacle-analysis frames are not stored. User-requested placement photos are stored in SQLite for 24 hours after explicit placement confirmation, served only to authenticated users, and purged on startup, access and periodic cleanup. They are supporting evidence, not independent AI verification. Image analysis remains opt-in, rate-limited, and advisory.
- Keep green for normal progress, yellow for warnings, and red for duplicate barcode errors and critical stop observations.
- Run npm test and node --check public/app.mjs after changing workflow code.
- Verify on the actual Android Chrome phone before claiming camera, audio, or AI performance.
- The dashboard and robot integration are future work; do not add fake metrics or simulated robots to this release.

- In receiving mode, each explicit next-item permission allows one receipt attempt, then pauses. Done stops scans and submits for laptop approval. Do not let speech output trigger voice input.

- Put-away begins with a fresh Receiving checkpoint and a product pickup scan. Select the approved task by scanned SKU, never by queue order; reject ambiguity. Pickup clears old shelf/product verification.
