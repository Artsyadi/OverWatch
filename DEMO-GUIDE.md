# Overwatch showcase guide

## One-minute demonstration

Start on Operations with a fresh demo. Use 4× robot speed for the recording. Keep a local run available even after publishing. For live AI, test the key and response time before recording; otherwise explicitly introduce this recording as the rules-based execution demo.

| Time | Show | Say |
| --- | --- | --- |
| 0–8 sec | Review “Fulfill order #1042”, approve the plan. | “Overwatch coordinates a warehouse order across people, AI planning and robot transport.” |
| 8–24 sec | Worker view: replenish HD-202, then pick NB-101 and HD-202. Confirm tote loaded. | “People verify each item. The system tracks stock movements and releases the next task only when the handoff is complete.” |
| 24–36 sec | Block the main aisle. Watch the alternate route. | “The robot is simulated, but its mission is controlled by the running task engine. Changing the warehouse changes the route.” |
| 36–49 sec | Leo receives, checks, packs and confirms carrier handoff. | “Arrival unlocks the catalogue work. Missing items prevent dispatch.” |
| 49–60 sec | Show 100% completion, final inventory, and Activity. | “Every action has an owner and a record. Overwatch closes the loop between planning, execution and recovery.” |

Use a real screen recording of the running app. No generated animation is needed. On Windows, the Snipping Tool's video mode can record the browser area. Keep the recording between 30 and 60 seconds, and rehearse once before the final take.

## Optional scenarios for questions

- **Wrong item:** on a pick task enter the other SKU. The task stays active, the error identifies the expected SKU, and inventory stays unchanged.
- **No path:** while Atlas carries T-14, block both cross-aisles. The robot stops. Reopen the alternate aisle and it continues.
- **Robot unavailable before pickup:** mark R1 unavailable before transport starts. R2 receives the mission. An already-active unloaded mission requires approved reassignment.
- **Robot unavailable while carrying:** mark R1 unavailable after collection. The tote stays “On R1.” Restore R1, request recovery and approve resuming.
- **Worker report:** report a damaged box. The task blocks. Supervisor replies in the incident, requests recovery and approves resume after checking the issue. No unreported stock adjustment is assumed.
- **Order shortage:** select #1043 and confirm its hold. The cap has zero available inventory and the whole order remains unshipped.
- **Recovery after refresh:** reload during transport. State and inventory remain, but work starts paused until Resume.

## Three-minute pitch outline

**0:00–0:25 — Problem.** Aditya works in USC bookstore/mailroom storage. Feedback from just over 50 staff across warehouse or similar work identified wrong picks, inventory counts that lag moves, and missing items that can cause a second shipment. These are user-reported conversations, not a quantified or representative survey.

**0:25–0:50 — Customer insight.** The important failure is often the handoff: shelf to picker, picker to transport, transport to catalogue, and packing to dispatch. A shared task and inventory record makes those transitions inspectable.

**0:50–1:50 — Demo.** Show the goal, verified picks, simulated transport and obstacle recovery, then complete dispatch. State whether live AI or the rules-based planner is active.

**1:50–2:20 — Value and differentiation hypothesis.** Overwatch ties assignments and recovery to the physical state of the order. The initial proposed wedge is small warehouse teams adopting mixed human/robot workflows. Existing warehouse and robot orchestration tools are competitors; uniqueness and buyer demand still need validation.

**2:20–2:40 — Business model hypothesis.** Site subscription with an optional robot integration fee. Test willingness to pay with an operations manager. Do not present an unvalidated price or savings percentage as measured evidence.

**2:40–3:00 — Next steps.** Validate in shadow mode at one willing site, measure inventory discrepancies and incomplete dispatches, connect one real robot adapter, and replace browser-local storage with a shared authenticated backend.

## Submission checklist

- A working local demo and, when available, a tested public link.
- Six-slide PDF with actual research evidence and clearly labeled hypotheses.
- A 30–60-second screen recording of the built product.
- Prompt C, team code and all six team members entered in the submission.
- Check links from a fresh browser and confirm the deadline in the event portal.

The competition onboarding specifies Sunday September 27, 2026, 11:59 p.m. Pacific for submission. No submission, upload or publication has been performed by this project.
