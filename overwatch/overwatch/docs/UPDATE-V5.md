# Overwatch v5: scan the picked product to select its task

## Install

Stop the Overwatch server with Ctrl+C; leave Cloudflare running. Extract the ZIP and copy the contents inside its overwatch folder into the existing project folder containing START-WINDOWS.bat, replacing matching files. Run START-WINDOWS.bat, reload phone and laptop, and sign in. Check for PICKUP SCAN V5.

No database reset is required. Existing inventory, tasks, photos, API settings and printed labels remain usable. For a deliberately clean rehearsal, the existing RESET-DEMO-WINDOWS.bat remains available; it deletes demo data.

## Updated put-away sequence

1. Scan the batch using the v4 voice flow: Scan complete. Scan next item? → Yes or Done.
2. Approve the batch on the laptop. Voice mode automatically enters pickup without selecting a product or destination.
3. The phone says Scan the RECEIVING QR to begin put-away. Scan the label at the entrance.
4. It says Scan the product you are picking up. Scan the product you actually chose, in any order.
5. The server matches that barcode to an approved, unfinished task. The phone announces the product and its assigned shelf, then shows its route. This pickup scan is logged separately and does not add stock or complete placement.
6. Follow checkpoints. Scan the destination shelf and rescan the matching product. Physically place it, point the camera at it, and say Item on right location. Photo and placement are saved together; photos are available for 24 hours.
7. Say Yes for another item. Return to Receiving and repeat steps 3–6. All items placed ends the demo.

Products scanned before Receiving are rejected. Unknown, unapproved, or already-completed products cannot become active tasks. The Receiving checkpoint must be less than three minutes old; rescan it if necessary. If several approved receipts have the same barcode, the current batch takes precedence; otherwise the app refuses ambiguity and asks you to select the intended queue entry/batch before rescanning. Selecting a queue entry never substitutes for the physical pickup scan.

On page reload, put-away restarts at the pickup gate so an old selected task cannot silently dictate the route. Picking a product clears previous shelf/product verification: you must verify at the shelf again.

## Verification

24 automated tests pass. The full UI workflow test picks Oats before Rice regardless of receipt queue order, blocks product scans before Receiving, rejects unapproved Tea, selects the destination from the scanned product, and completes both voice placements with photos. HTTP/domain tests enforce the approved-stock and fresh-Receiving checks.

Syntax check passes. Pixel camera, microphone and live transcription still require the on-device rehearsal. Voice setup, recording guidance and photo retention details are in UPDATE-V4.md. The physical route graph remains unchanged; confirm its checkpoint order matches the kitchen.
