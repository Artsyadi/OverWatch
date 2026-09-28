# Overwatch v3: one scan per voice permission

## Install and reset the old demo

1. Stop Overwatch in the server Command Prompt with Ctrl+C. If Windows asks to terminate the batch job, type Y and press Enter. Leave the separate Cloudflare tunnel running.
2. Extract this ZIP. Open its overwatch folder, select its contents, and copy them into the EXISTING project folder containing START-WINDOWS.bat. Choose Replace for matching files. Do not nest another overwatch folder inside it.
3. In Command Prompt in that existing project folder run RESET-DEMO-WINDOWS.bat. This permanently clears old tasks, pending batches, inventory, event history, custom products, and blocked paths. It restores the four printed-label catalogue entries. Your API settings and warehouse map remain.
4. Wait for RESET COMPLETE. If it says the server is still running, stop that server and rerun the reset. Press a key to close the reset script.
5. Run START-WINDOWS.bat. Reload Chrome on phone and laptop, and sign in with the access code from the restarted server. The same tunnel URL works while its process remains running.
6. Verify the page says VOICE BATCH V3. Verify Activity & inventory has no stock or old events before starting a batch. No labels need reprinting.

## New scanning sequence

1. Start new batch, start camera, enable Voice on, and tap Enable voice commands once. Allow microphone permission. Enter Glasses view if desired.
2. Show just Rice. The first scan is armed automatically for an empty batch. It announces Scan complete and the product name, saves one pending row, and pauses.
3. Wait for the spoken confirmation to finish and the microphone button to say Listening. Aim at the next product, then say Yes, scan the next item. Next item / scan the next item / yes also work. Only one receipt attempt is allowed per command.
4. After that scan it pauses again. Repeat for the remaining products.
5. Say Done. This immediately pauses new scans, finishes any in-flight save, sends the saved batch to laptop review, and turns off voice listening. Stock remains unchanged until approval. The camera stays visible as the HUD background, but barcode decoding is paused.
6. Approve the batch on the laptop. Then Begin put-away, scan Receiving and the requested checkpoints, verify shelf and product, physically place it and Confirm placed.

To test duplicates, after a successful Rice scan, keep Rice in view and deliberately say Yes, scan the next item. The duplicate attempt produces red, saves nothing, and pauses again. A barcode staying in view while paused does not repeatedly trigger errors.

If a page is refreshed during a pending batch, scanning starts paused. Tap Next item or enable voice commands and say the next-item command. To continue after a completed put-away, use Start new batch for new receipts or Choose next approved item for existing approved receipts.

## Voice and recording

The microphone pauses while the app speaks so it does not interpret its own prompts. Wait for Listening before speaking. If speech recognition is unavailable or permission/network errors occur, the app shows a warning and provides Next item and Finish batch buttons. Enable voice commands must be tapped again after a reload, an error, or finishing a batch. Voice input uses Chrome speech recognition, not the GPT key.

Test both recognition and recording on the Pixel before the final take. Screen recording with microphone audio can affect browser microphone access on some devices; if it fails, test with the recorder stopped to isolate the issue. Device audio recording of spoken guidance also needs verification. Neither device recognition nor recording audio was tested here.

## Validation

19 automated tests pass, including execution of the worker UI scan/voice handler against the real database domain, duplicate red alerts, one-scan gating, batch approval, and the reset script's refusal to run while its server port is active. Node syntax check passes. The actual Pixel camera and microphone still need a device test.

The current checkpoint graph is unchanged. Physical walking order must still be checked against the kitchen before recording navigation.
