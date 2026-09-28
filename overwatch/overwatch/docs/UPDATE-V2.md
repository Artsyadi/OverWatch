# Overwatch v2 — batch receiving and glasses view

## Update your existing Windows copy

1. Keep the Cloudflare tunnel terminal open. Stop only the Overwatch app server: click its terminal, press Ctrl+C, and answer Y if Windows asks to terminate the batch job.
2. Back up the existing `overwatch` folder while the server is stopped. Your real records are in its `data` folder.
3. Extract this ZIP. Copy the contents of its `overwatch` folder into your existing `overwatch` folder. Choose Replace for matching files. Do not delete your existing folder.
4. Your `.env` and `data` are not included in this release; keep your existing copies. Open your existing `.env` locally and set `TRUST_PROXY=true` for your Cloudflare tunnel if not already set. Save it without sharing its contents.
5. In the app's original Command Prompt, run `START-WINDOWS.bat` again. Use the new startup access code if it changed. The server adds batch tables without deleting v1 inventory or task history.
6. Refresh the app on both devices. On the laptop, Ctrl+F5 reloads the updated assets. On the phone, use Chrome's Reload. Sign in again after the restart.
7. The tunnel URL stays the same if you kept the Cloudflare process running. Camera scanning and AI still use your existing laptop server and API configuration.

## First batch test

1. On the phone, press **Start new batch** (or **Start batch** in glasses view).
2. Press **Start camera**, then **Glasses view**. The phone shows live camera video with small status overlays; it is a camera preview of the intended display-glasses interface, not optical transparency or tracked AR.
3. Scan the Rice label. You should see **Scan saved** and 1 label. Keep only one distinct code in view.
4. Move the label fully out of view for at least a second, then scan Rice again. Expect a **red Duplicate barcode blocked** alert; the count stays 1. Holding the same label continuously produces only one capture, not repeated error alerts.
5. Scan Oats, Tea, and Beans, one at a time. The count reaches 4, with no approved stock added by these scans.
6. Tap **Finish batch**. The queue is closed for scanning and waits for laptop review.
7. On the laptop open **http://localhost:3000/?review=1** or click **Laptop review**. Review product names and quantities. Unknown products require a name and category. Approve the reviewed products and confirm the total.
8. On the phone wait up to three seconds for **Batch approved**, then tap **Begin put-away**. Choose an approved product. Your earlier v1 Rice task remains in the approved put-away queue as a separate receipt.
9. Scan RECEIVING, then the checkpoints along the path. For Rice the assigned shelf is normally A-R1-S1. Test the wrong shelf A-R1-S2: expect yellow and no placement.
10. Scan the assigned shelf, rescan the matching product, physically place it, and confirm within 60 seconds. This product rescan is verification, not another receipt; it must remain allowed.
11. Open Details and choose the next approved item. Confirmed inventory and pending scans remain stored after a browser refresh or server restart.

Duplicate protection is per batch, enforced in the database. The same SKU is allowed in a deliberately started new batch. Ordinary retail barcodes identify a product type, not each individual package: identical packs may share the same barcode. Enter their physically verified quantity once during laptop review. Unique per-package tracking would require serialized labels.

Review uses the same workspace code as the phone. The separate laptop review page is an operating workflow, not a separate supervisor permission system. A full multi-user role system is not included in this pilot.

## Your kitchen layout

The supplied video shows a narrow kitchen passage, a counter/sink area, and the refrigerator/cooker farther inside. It does not establish a second walkable route. The v2 map therefore uses one chain:

**RECEIVING → WEST → RACK_A → EAST → RACK_B**

These are checkpoint names, not compass directions. The drawing is schematic and contains no measured distances or automatic localization. Put the physical markers in the order above, on the accessible side of the passage, and verify it by walking it before the demo.

- **RECEIVING:** a cleared section of the outer counter, on the room side of the kitchen entrance. Keep the front door and passage unobstructed.
- **WEST:** at the entrance to the tiled kitchen passage.
- **RACK_A:** at your first reachable, dry storage zone along the passage. Mark two distinct accessible shelves or two separate trays A-R1-S1 and A-R1-S2. Do not use the sink/draining board as storage.
- **EAST:** farther along the same passage, between the two storage zones.
- **RACK_B:** at a second reachable dry storage zone. Mark B-R1-S1 and B-R1-S2; use a stable shelf or cleared surface away from the cooker. The video does not show cabinet interiors, so confirm that the chosen space actually exists and is accessible.

Shelf 1/2 can be two clearly separated marked positions for this small demo; they need not be a tall industrial rack. Existing product and shelf QR codes are unchanged. The new PDF replaces the old assumed two-path map and updates the instructions.

If there is not enough room for that sequence, move the demo storage zones into the adjoining room and adjust the map before testing. Do not place markers to imply a passage through a counter, appliance, or closed cabinet.

A box in the single passage means **stop / no available route**. Remove it after inspection and use **I inspected this path: reopen**. The app cannot offer a real detour when the room has none. To demonstrate rerouting, first establish and map a second genuine passage elsewhere.

## Verification boundary

16 automated tests pass, including duplicate rejection, persistent queues, migration from v1, atomic batch approval, two authenticated device sessions, shelf verification, and scan-frame deduplication. V1 camera scanning and receiving were observed on your Pixel via your screenshots. The new v2 interface and batch workflow still need your actual Pixel/laptop test after installation. Live OpenAI obstacle recognition and audio output have not yet been confirmed by your device test.
