# Overwatch v4: hands-free worker demo and placement photos

## Install

1. Stop the Overwatch server with Ctrl+C (Y if Windows asks to terminate the batch). Leave the Cloudflare tunnel running.
2. Extract this ZIP. Copy the contents INSIDE its overwatch folder into your existing project folder containing START-WINDOWS.bat. Replace matching files. Do not create another nested overwatch folder.
3. For a clean rehearsal, run RESET-DEMO-WINDOWS.bat from Command Prompt in that project folder. This deletes existing demo inventory, scans, tasks, history, block reports and placement photos, and restores the four printed-label catalogue entries. Your API settings and labels remain. Wait for RESET COMPLETE.
4. Run START-WINDOWS.bat. Reload phone and laptop pages and sign in using the server access code.
5. Check the page says VOICE + PHOTO V4. The microphone area should say Microphone off initially.

## One initial start, then voice

Tap Start voice demo once. Allow camera and microphone permissions. This starts the camera, initializes the microphone and receiving batch, and opens Glasses view. Browsers still need this initial action and permission grants; there are no per-item button presses in the worker workflow.

- Show the first product label. On success the app says exactly: Scan complete. Scan next item?
- It pauses scanning. Wait until the microphone status is Listening. Aim at the next product and say Yes.
- Hearing you / Understanding / Heard: Yes makes the audio path visible. When the transcript is accepted, scanning resumes for one item only.
- After the next scan it asks the same question. Repeat for your products.
- Say Done after the final product. Only that recognized command (or a deliberate recovery button outside voice mode) submits the batch. No timer submits it. No stock is added yet.
- Approve the batch on the laptop. This remains the required human approval step. The phone then automatically begins put-away while voice mode is running.
- Scan Receiving and the requested route checkpoints. At the destination, scan the assigned shelf, then the matching product.
- Physically place the product, point the camera at it, and say Item on right location.
- The app captures the current camera frame at the end of that utterance. After transcription and verification it saves the photo and placement together, and announces confirmation.
- If more approved items remain, say Yes to move to the next task. When all are placed, the app announces Demo complete.

Use one code in frame at a time. A duplicate attempt after saying Yes is rejected in red and pauses scanning again. A QR left in view while paused is ignored.

## Placement evidence

The snapshot is a real camera JPEG, associated with task/product, shelf, capture time, and voice confirmation. It is stored in SQLite for 24 hours. Activity & inventory on the laptop shows the thumbnails and expiry times; click a photo to view it. Sign-in is required to retrieve photos.

Shelf and product verification must both be current (60 seconds). The camera must be live. If the image cannot be captured or stored, placement is not marked complete. The photo supports the operator's confirmation; the system does not claim independent visual proof that the item was released onto the correct shelf.

Expired photos are unavailable immediately when requested and purged on startup, database access, or the minute cleanup timer while the server runs. If the laptop is shut down, physical cleanup happens when it next starts. Stock and task records remain after photo expiry.

## Voice implementation and first test

V4 replaces Chrome SpeechRecognition with direct microphone audio capture and the OpenAI audio transcription endpoint, using the existing OPENAI_API_KEY on your laptop. Short detected utterances are uploaded through the authenticated server. Audio is not saved to the app database. Model default: gpt-4o-mini-transcribe, optional OPENAI_TRANSCRIBE_MODEL override. Limit: 240 requests/hour. Normal API usage charges apply.

The microphone is suspended while the app speaks, and for 800 ms afterward. Queued transcripts are invalidated when an app prompt begins or the task changes. The receiving prompt does not speak the finish command. Only exact recognized command phrases are acted on. Unknown speech does not advance the workflow.

First test without screen recording, in a quiet room. After one scan, wait for Listening, say Yes, and check Heard: Yes and the microphone meter. An API/key/billing failure appears in the app. Then repeat the test with screen recording. If enabling the recorder makes microphone input stop, use device-audio-only screen recording or record narration separately; do not assume voice commands are working while the meter is flat. A phone/API test is still necessary.

If the API is unavailable, voice mode cannot start; it does not silently pretend that a command was understood. Existing manual controls remain for troubleshooting outside the hands-free path.

## Validation

23 automated tests pass. Coverage includes the actual UI command handlers with real database operations, pause/resume/duplicate/finalization behavior, complete multi-item voice placement, microphone silence gating, delayed transcript invalidation during playback, WAV API request construction (mocked upstream), photo authentication, atomic placement/photo writes, expiry, and reset. Syntax checks pass.

The live OpenAI transcription call, Pixel audio capture, and screen recording interaction have not been tested from this workspace. These tests are not a claim of measured phone reliability.

Official integration reference: https://developers.openai.com/api/docs/guides/speech-to-text

The route graph is unchanged. Confirm that its checkpoint order matches your physical kitchen before demonstrating navigation.
