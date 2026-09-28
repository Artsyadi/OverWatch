Current release: **v0.5.0 — Receiving + scanned-product pickup**. See [v5 update instructions](docs/UPDATE-V5.md).

Current release: **v0.4.0 — voice demo and placement photos**. Follow [v4 installation and demo instructions](docs/UPDATE-V4.md). This supersedes the older voice instructions below.

Current release: **v0.3.0 — voice-controlled batch scanning**. See [v3 update and reset instructions](docs/UPDATE-V3.md).

# Overwatch — Worker prototype v2

**Updating an existing copy? Read [the v2 update guide](docs/UPDATE-V2.md).** This version adds durable batch receiving, red duplicate alerts, a laptop approval page, and a full-screen glasses-style camera view. Your v1 inventory is preserved by an additive migration.


A working receiving and put-away application for an Android phone running Chrome. Your rear camera reads product, checkpoint, and shelf labels. A Node.js server stores real approved inventory and task history in SQLite. Optional OpenAI image analysis observes the next path segment and can mark it blocked; routing recalculates on the configured map.

**This package is source code, not an already hosted website. Start it on your laptop, then open its HTTPS address on your Pixel. No npm install is needed.**

## Start on Windows

1. Extract the ZIP completely. Open the `overwatch` folder.
2. Install **Node.js 24 or newer** from https://nodejs.org if needed. Verify with `node --version` in a new terminal.
3. Double-click `EDIT-SETTINGS-WINDOWS.bat`. It opens `.env` in Notepad.
4. Set `ACCESS_CODE` to a private passphrase of at least 12 characters. Leave it blank to generate a random code each server start.
5. To enable actual camera-image analysis, put your OpenAI API key after `OPENAI_API_KEY=`. Do not put quotation marks or spaces around it. Keep this file private. Do not put the key in a webpage or share it in chat.
6. For the Cloudflare tunnel below, set `TRUST_PROXY=true`. Save and close Notepad.
7. Double-click `START-WINDOWS.bat`. Keep this terminal running. It displays your app access code.
8. Open **http://localhost:3000** on the laptop. Enter that access code. The app is now running locally.

The API key is optional for scanning, receipts, shelf verification, routing, and spoken prompts. It is required for image analysis. A ChatGPT subscription by itself does not configure API access; use your existing API account/key and available credits.

### Open it on your Pixel with HTTPS

Phone camera access needs HTTPS (or a phone-local localhost connection). Opening `http://<laptop-IP>:3000` over Wi-Fi usually does not meet this requirement.

1. Install Cloudflare Tunnel from its official documentation: https://developers.cloudflare.com/tunnel/get-started/
2. On Windows, one installation option is:

   ```powershell
   winget install --id Cloudflare.cloudflared --exact
   ```

3. Reopen your terminal after installation. Keep the Overwatch server running, and double-click `TUNNEL-WINDOWS.bat`, or run:

   ```powershell
   cloudflared tunnel --url http://localhost:3000
   ```

4. Cloudflare prints a temporary address like `https://<random-name>.trycloudflare.com`. Copy the actual address it gives you into Chrome on the Pixel. Do not use the example placeholder.
5. Enter your workspace access code. Tap **Start camera**, allow Camera, and use the rear camera. If the wrong lens opens, use **Switch lens**.
6. Connect headphones through Android Bluetooth/audio settings. Tap **Voice on**, then **Repeat instruction** to check the output.

This exposes the app at a temporary public address, protected by the workspace code. Keep both terminal windows and the laptop awake during the demo. The URL changes when the tunnel is restarted and stops working when the tunnel or laptop stops. Do not submit it as a permanent project link. Share a repository link for durable review, or deploy the app to a persistent host.

No Cloudflare account is required for a Quick Tunnel. Quick Tunnels are a development/demo facility, not production hosting. If campus networking blocks tunnels, Chrome's USB port forwarding is an alternative: https://developer.chrome.com/docs/devtools/remote-debugging/local-server . Forward phone port 3000 to laptop `localhost:3000`, then open `http://localhost:3000` on the phone. Follow Chrome's official setup for Android debugging permissions.

## Physical setup — four pages to print

Open `public/labels.pdf` (or the app's **Print labels** link). Print at 100% / Actual size. Retain the white border around each QR code.

| Page | Contents | What to do |
| --- | --- | --- |
| 1 | Map, instructions, RECEIVING checkpoint | Put RECEIVING at your starting table |
| 2 | Rice, oats, tea, canned beans | Attach labels to these products or clearly labelled props |
| 3 | Four shelf labels | Attach to four distinct shelf positions |
| 4 | WEST, EAST, RACK A, RACK B checkpoints | Position at the corresponding real locations |

The built-in map follows one corridor: Receiving → West → Rack A → East → Rack B. There is no assumed detour. West and East are checkpoint names, not compass directions. **Only use this map if those paths really exist in your demo area.** Edit the `nodes` and `edges` in `warehouse.json` if needed and restart the server. Coordinates control the schematic drawing; they are not real-world metres or camera pose.

Product defaults:

| Product ID | Name | Preferred shelf | Storage category |
| --- | --- | --- | --- |
| OWP-RICE | Rice | A-R1-S1 | dry |
| OWP-OATS | Oats | A-R1-S2 | dry |
| OWP-TEA | Tea | B-R1-S1 | beverage |
| OWP-BEANS | Canned beans | B-R1-S2 | canned |

These are project-specific product IDs, not retail UPC registrations. The QR and Code 128 on each product label encode the same ID. Chrome deduplicates identical codes in the same frame. For ordinary supported retail barcodes, an unknown ID opens an operator-filled product record instead of inventing details.

Shelf capacity is 12 units per shelf in this pilot. Approved receipts reserve space, even while they are still at Receiving. Rice and oats may use another compatible dry-goods shelf if their preferred shelf fills. Editing catalogue defaults after the first database creation does not overwrite existing products; use the original defaults for this pilot or make a deliberate database migration.

## First real workflow

1. On the phone, start a new batch, start the camera, and choose Glasses view if desired.
2. Scan Rice, Oats, Tea, and Beans one at a time. Scans are saved in a persistent pending queue, separate from inventory.
3. Remove a scanned barcode from view for a second, then show it again. A red duplicate error appears; the count does not increase. Continuous frames of one label are treated as one presentation.
4. Tap Finish batch. On the laptop open `http://localhost:3000/?review=1` or Laptop review.
5. Review each product and its actual quantity; approve and confirm the batch. The database records approved units at RECEIVING and reserves compatible shelf capacity atomically. An invalid row or insufficient capacity leaves the entire batch pending.
6. The phone updates automatically. Tap Begin put-away and select an approved item.
7. Scan RECEIVING and each checkpoint along the marked path. For Rice, scan WEST then RACK_A. For Rack B, continue via EAST.
8. Scan a wrong shelf to test the yellow warning. Then scan the assigned shelf and the matching product, physically place it, and confirm within 60 seconds.
9. Choose the next approved item. Activity & inventory shows the real records; completing put-away moves stock without adding units again.

Duplicate rejection applies per receiving batch, on the server and through a unique database index. Barcode quantities are reviewed manually: identical retail packages can share one barcode. Re-scanning a product during shelf verification is intentionally allowed. Starting a new batch permits a new receipt of the same product. Pending scans survive reloads and server restarts; unsent offline frames are not claimed as saved.

The laptop review surface is separate from the worker view, but both use the same pilot workspace code; this is not an enterprise supervisor role boundary.

The placement confirmation is a real human approval. The system verifies label identities but does not independently prove that your hand released the item onto the shelf.

### Actual obstruction observation and rerouting

1. Enable `OPENAI_API_KEY` in `.env` and restart. The badge says **AI CONFIGURED**, not that an analysis has already succeeded.
2. Approve a batch and choose its rice receipt. Scan RECEIVING. This kitchen has a single mapped corridor, so a blocked segment will produce a stop instruction.
3. Place a clearly visible, harmless demo obstacle on the Receiving → West walkway. Stay still at Receiving and aim the camera down that segment. Do not point at the product or a countertop.
4. Read and tick the direction confirmation. Tap **Check camera view**. A reduced JPEG frame goes to OpenAI, and the app shows the returned observation with its timestamp.
5. If the model reports an obstruction with confidence at least 0.75, the server blocks that segment and recomputes routing. On this kitchen map there is no alternate path, so it tells the worker to stop. A detour is only possible if a real second passage is explicitly mapped. Uncertain observations do not mark the path safe or automatically block it. A confident serious-hazard observation uses a red stop notice.
6. **Auto: on** samples a frame every six seconds while you remain stopped and the page is visible, up to the server's hourly cap. It pauses when the task/route/checkpoint changes, the page is hidden, or a request fails. Confirm camera direction again after a route change. Turn Auto off when finished.
7. If the model cannot recognise the obstacle, use **Report next path blocked**. This is a real human report, logged as `operator`, never presented as AI detection.
8. A blocked segment stays blocked until an operator physically inspects it and presses **I inspected this path: reopen**.

**Camera analysis is advisory and has network latency. This is not continuous collision avoidance, depth measurement, or certified safety equipment.** The current position is the last scanned checkpoint, expires after three minutes, and does not move automatically. No viable route produces a stop/assistance instruction. Green route lines show the plan, not proof that a route is clear.

Camera images are not saved in the app's database. They are sent to OpenAI only for requested or explicitly enabled auto checks, with `store:false` in the API request. That setting is not a promise of zero provider retention; the API provider's applicable data policies still govern processing. The server stores short observations and audit events. Stop the camera/Auto to stop capture/checks.

### Audio and short voice commands

Spoken prompts use the browser's speech synthesis and the phone's selected audio output. Test the real headset. Commands use browser speech recognition, which can depend on browser services and network access. Tap **Mic command**, then say exactly one of:

- `repeat`
- `where next`
- `check path` (requires the camera-direction checkbox)
- `finish batch` (sends the saved batch for laptop review)
- `begin put away` (selects an approved item)
- `confirm placement` (only after fresh shelf and product verification)

Use the buttons if recognition is unavailable. Mic permission is separate from camera permission.

## What is implemented / what is not

Implemented: durable batch queues, red duplicate rejection, laptop batch approval, full-screen glasses-style camera HUD, live browser camera, native barcode/QR detection where supported, approval-gated receipts, persistent SQLite records, capacity-aware shelf assignment, checkpoint routing, actual server-side OpenAI image-analysis integration, operator obstacle reporting, incorrect shelf/product checks, speech, event history, and JSON export. No robot activity or inventory is pre-populated.

Not implemented: a full supervisor dashboard, robot integration, continuous indoor positioning, floor-anchored AR arrows, arbitrary warehouse mapping, reliable general hazard avoidance, or automatic physical placement detection. The Activity panel is a minimal audit view, not a full dashboard. A complete WMS would also need multi-user roles, stock adjustment workflows, integrations, and operational validation.

## Technical operation

```
Pixel Chrome → same-origin Node HTTP API → SQLite
                      ↓ (optional, requested camera checks)
                 OpenAI Responses API
```

- Runtime: Node 24+, built-in `http`, `sqlite`, and `fetch`; zero runtime npm dependencies.
- Client: plain HTML/CSS/ES modules; Android Chrome `BarcodeDetector`, `getUserMedia`, speech synthesis, optional speech recognition.
- API key: server environment only. The browser receives only a configured/not-configured flag and selected model name.
- Authentication: shared workspace passphrase; HttpOnly, SameSite cookie; origin checks; login throttling. This is a pilot, not enterprise identity management.
- Data: `data/warehouse.sqlite` and its SQLite WAL sidecars. It persists when the server restarts. Back up the database while the server is stopped. Keep data outside version control.
- Route map: `warehouse.json`; shortest-path routing excludes reported blocked segments.
- OpenAI: `POST /v1/responses`, structured observation output, server-side rate limit, 25-second timeout. Default model `gpt-4o-mini` is configurable through `OPENAI_MODEL`.
- No automatic inventory mutations from model output. A model can report a path observation; only the human approval routes update stock.

Other operating systems:

```bash
cp .env.example .env
# Edit .env in your preferred text editor.
npm start
```

Tests:

```bash
npm test
```

The included tests use temporary databases only and do not alter your actual inventory. See `docs/VERIFICATION.md` for the verification boundary.

To regenerate labels (optional development task), install Python's `reportlab` package and run `python scripts/make_labels.py`. The PDF is already included; Python is not required to run the app.

## Deployment and submission

The laptop + Quick Tunnel path is the quickest way to test the actual Pixel camera. For a durable hosted URL, deploy the included Dockerfile to a service with HTTPS and a persistent volume mounted at `/data`. Supply `ACCESS_CODE` and `OPENAI_API_KEY` as server secrets. Do not place SQLite on an ephemeral serverless filesystem or claim data will survive there.

For GitHub, upload the source folder without `.env`, `data/`, logs, or any API key. A `.gitignore` is included. No GitHub repository has been created by this package.

The reviewed Origin Weekend page asks for a six-slide deck following its outline, a project link, and a 30–60 second real demo video (the video text says "feel free" and rejects AI-generated content). Follow organizer instructions if they differ. The exact deck outline and a recording plan are in `docs/SUBMISSION.md`. We continue to target your stated 6 pm deadline despite Devpost displaying midnight PDT.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `node:sqlite` missing | Install Node 24+ and reopen the terminal |
| Camera not offered | Open the HTTPS tunnel URL on the Pixel; allow Camera in Chrome settings |
| Wrong lens | Tap Switch lens until the rear view is correct |
| Scanner unavailable on laptop | Use Android Chrome on the Pixel; manual entry is labelled separately |
| Nothing scans | Use one printed label in good light, avoid glare, try 15–30 cm away |
| AI OFF | Add the key to `.env`, save, restart server |
| AI configured but request rejected | Check API credits, key validity, model access, and displayed error |
| Too many camera checks | Turn off Auto; wait for the hourly window or deliberately adjust server cap |
| Route does not match room | Correct the graph in `warehouse.json`; do not follow a fictitious path |
| No route | Inspect/reopen a real blocked path or correct the map |
| Placement disabled | Rescan the correct shelf, then the matching product; confirm within 60 seconds |
| Cannot hear prompts | Turn Voice on, raise media volume, select the desired Android audio device |
| Connection lost after restart | Sign in again with the startup code; saved inventory remains |

Documentation references: https://developers.openai.com/api/docs/guides/images-vision ; https://developers.openai.com/api/docs/guides/structured-outputs ; https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector ; https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia .
