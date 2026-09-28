Latest: v4 has 23 passing automated tests. See UPDATE-V4.md for scope and device-test limits.

# Verification report — 27 September 2026

## Executed successfully

- Node syntax checks for server, domain, and browser module.
- Sixteen automated tests passed with real SQLite databases, including a real local HTTP server test.
- Persistent batches reject duplicate barcodes with a structured error; scan-frame gating prevents repeat captures of a continuously visible label.
- Batch approval is atomic and idempotent; a capacity failure rolls back all rows.
- A separate authenticated laptop session can review/approve a phone batch; the phone sees the result.
- Additive v1 schema migration preserves the existing receipt and inventory.
- Pending scans leave inventory untouched.
- Explicit receipt approval creates stock once; retrying the approval is idempotent.
- Wrong shelf and wrong product prevent completion.
- Shelf/product verification expires; switching to a wrong shelf invalidates prior verification.
- Explicit final placement confirmation changes location without duplicating quantity.
- Reserved and stored receipts count toward shelf capacity.
- Unknown barcodes require operator product details; manual entry stays labelled as manual.
- Shortest-path routing excludes blocked segments; no available path returns no route.
- Inventory and blocked routes persist across database restart.
- HTTP authentication, rejection of a cross-origin mutation, approval gates, no-key camera-analysis error, and static asset serving.
- Four-page label PDF rendered and visually inspected after embedding fonts. No clipped labels or QR quiet-zone overlap observed.

## Observed on the user’s actual devices (v1)

User screenshots confirmed Windows startup, Cloudflare tunnel connection, Pixel Chrome camera and barcode decoding, Rice receipt approval, and checkpoint-based route display. These observations apply to v1; the v2 batch/HUD changes await device testing.

## Not verified in this environment

- V2 browser interaction/layout, headset output, microphone recognition, and full batch workflow on the Pixel.
- Live OpenAI image analysis: no user API key was supplied to this environment. The real integration is implemented; it has not been represented as a successful live call.
- A permanent deployed HTTPS site or a GitHub repository.

The local browser binary was unavailable and its installation was denied by the environment's network policy. The cloud browser could not open localhost. These limitations prevented an interactive browser pass; they do not substitute for device testing.

## Required acceptance pass on the actual phone

1. Sign in over HTTPS and grant camera access. Confirm the rear camera view.
2. Scan each printed product/checkpoint/shelf label; verify the displayed ID.
3. Scan a multi-product batch, deliberately re-present a barcode, verify the red duplicate alert and unchanged count, approve on the laptop, then verify and place an item.
4. Refresh or restart the server; verify the same stock and completed task still exist.
5. Check that repeated frames did not create duplicate units.
6. Test a real image-analysis request with the API key configured. Then test a controlled visible obstacle; inspect the returned observation and no-route stop response for this single-corridor map.
7. Confirm manual reports are labelled as operator reports. Confirm uncertain AI output does not claim a safe route.
8. Test audio on the specific headset. Keep tap controls available.
9. Record the real successful workflow for the submission.

Do not describe the app as production-ready or safety-certified. Do not claim an untested camera feature succeeded.

## Windows path fix

The original release used a forward slash when checking the static-file directory. On Windows this rejected valid assets, including index.html, with a 404. The fix uses the operating system path separator and checks hidden path components with either separator. Two added regression tests execute the actual boundary check with Windows and POSIX path implementations. Full tests pass; the user subsequently confirmed that the Windows app loaded and the Pixel connected.
