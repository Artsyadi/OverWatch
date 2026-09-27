# Overwatch

A working warehouse coordination demo for Origin Weekend, Prompt C: new operating systems for the physical world.

Overwatch turns a fulfillment goal into approved work, coordinates human confirmations and simulated robot missions, responds to obstructions, and records each inventory movement. The browser interface controls the workflow; it is not a static dashboard.

## Start locally

On Windows, double-click **START-OVERWATCH.cmd**. When it says the server is ready, open **http://localhost:3000**. Keep the terminal window open.

Alternatively, from this folder:

```sh
npm ci
npm run dev
```

Node.js 22.12 or newer is required. Dependencies are already installed on the original development computer. No hardware, camera, database or API key is required for the rules-based demo.

If port 3000 is occupied, set `PORT=3001` in a local `.env` file and use http://localhost:3001. Only run one server per port.

## Run the showcase

1. In Operations, review **Fulfill order #1042** and approve the plan.
2. Open Worker view as Maya. Enter **HD-202** with quantity **1** to replenish the pick shelf.
3. Enter **NB-101**, quantity **1**, then **HD-202**, quantity **1**, to verify the two picks.
4. Confirm the tote loaded. Overwatch assigns the transport mission.
5. Open Demo controls immediately and choose **Block main aisle**. The robot calculates the alternate route. **Block both aisles** demonstrates a stop and supervisor alert.
6. After arrival, switch to Leo and confirm receipt, contents checking, packing, and carrier handoff.
7. Open Inventory and Activity. Order #1042 is dispatched, the ledger identifies every actor and movement, and progress shows seven of seven stages.

For the shortage scenario, select order **1043**, review the plan and confirm the hold. CP-404 has no stock, so no items are reserved or shipped.

Use **Demo controls → Reset demo** to start fresh. Reset affects only this browser. Reloading an unfinished demo restores the state paused; select Resume.

Detailed timings and talking points are in [DEMO-GUIDE.md](DEMO-GUIDE.md). Project context and remaining external setup are in [HANDOFF.md](HANDOFF.md).

The six-slide pitch PDF is in `output/pdf/Overwatch-pitch.pdf`. Its editable content is in `tools/build_pitch.py`.

## Optional live AI

1. Copy `.env.example` to `.env` locally.
2. Enter your key privately as `OPENAI_API_KEY=...` in `.env`.
3. Restart the server. `OPENAI_MODEL` defaults to `gpt-5-mini`.

Never place the key in browser code, source control, slides or chat. `/api/health` reports whether a key is configured, without returning it. A configured key still needs valid API access and credits. Actual live-model access has not been verified in this environment because no key was supplied.

The server calls the OpenAI Responses API with a structured plan. The application checks references and capabilities and derives stock quantities and dependencies itself. On an API timeout or invalid response, a **clearly labeled rules-based fallback** supports the two demo orders. An AI call never changes stock directly. Refusals and unsupported goals do not execute actions.

## Verification

```sh
npm test
npm run test:api
```

`npm test` covers inventory conservation, incorrect and duplicate confirmations, prerequisites, stale/invalid plans, order holds, robot rerouting, unavailable actors, carrying-robot failures, worker reports, pause and restoration, and mocked API failure handling.

`npm run test:api` builds the production app and checks real HTTP routes on port 3128. `test:e2e` is an alias for these HTTP integration checks. The browser workflow is checked separately through the live interface.

## Production build and Replit

```sh
npm run build
npm start
```

Import the source into Replit. The included `.replit` file uses Node 22, port 3000, and an Autoscale deployment. Set `OPENAI_API_KEY` in Replit Secrets if desired; verify the production deployment also has that secret. Build with `npm ci && npm run build`; run with `npm start`.

Replit publishing has not been performed: the user chose **local demo first**. No public URL or cloud account access is assumed.

## Architecture and scope

- `shared/engine.ts`: deterministic command processing, task scheduling, approvals and append-only events.
- `shared/navigation.ts`: grid-based shortest-path navigation with live cross-aisle closures.
- `shared/seed.ts`: four fictional demo products, two orders, two humans and two simulated robots. Staff names and operational numbers are synthetic.
- `server/planner.ts`: optional live AI and validated fallback planning.
- `src/App.tsx`: supervisor and worker role views, orders, inventory, workforce and history.
- `src/WarehouseMap.tsx`: map, route and actor visualization.
- `src/store.ts`: versioned browser storage and paused restoration.

State belongs to a single browser profile. Role switching is a demo convenience, not authentication. This is not a production warehouse installation or a multi-device backend. Item ID entry represents a scan, and human completion is a confirmation, not camera verification. Robot motion and goods are simulated. Billing is seeded prepaid; carrier handoff is recorded locally, not sent to FedEx. Dispatch is not proof of delivery.

Inventory rules: reservation reduces available-to-promise; replenishment and picking move stock within the facility; only dispatch reduces on-hand. Loaded totes stay with their assigned robot if it fails. Missing stock blocks the whole order.

Official integration references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Replit Secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets), [Replit deployments](https://docs.replit.com/features/publishing/deployment-types).

### Voice input in Needs attention

Click the microphone, allow microphone access, speak an English instruction, then click the stop icon. The transcript appears in the existing reply field for review before sending. Recordings stop automatically after 30 seconds. This changes input only; the existing reply and recovery approval behavior is preserved.

Audio is decoded to mono 16 kHz PCM in the browser and sent to this app's `/api/transcribe` endpoint. A quantized Whisper Tiny model runs on the computer hosting the app; no speech API key is required and audio is not uploaded to a third-party transcription service. The first transcription downloads the public model from Hugging Face into the Transformers.js cache, so initial setup needs internet access. Short English demo instructions work best. Silence, missing microphone permission, and model loading failures display an actionable message.

If no text appears, use the microphone selector shown during recording or after an error to choose the built-in microphone. Quiet recordings are amplified before recognition; genuinely silent recordings are rejected. Echo cancellation and noise suppression are disabled to avoid filtering quiet speech. Transcripts appear directly in the reply field; no level meter or audio playback is shown.
