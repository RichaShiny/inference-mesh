# InferenceMesh

InferenceMesh is a browser-based peer-to-peer runtime for discovering devices, profiling available compute, routing workloads, and executing tasks across connected nodes.

## Inspiration

I started thinking about InferenceMesh while looking at how companies like NVIDIA and AMD approach heterogeneous compute and distributed inference.

At the same time, I was interested in the routing layer behind modern AI systems, where not every task necessarily needs the same model or the same amount of compute.

InferenceMesh is my attempt to explore that idea at the browser/device level: can a group of ordinary devices discover each other, understand what compute is available, and decide where a workload should run?

## What works

- Device capability detection
- CPU benchmarking
- Compute-room creation and joining
- Realtime peer presence with Supabase
- WebRTC signaling
- Direct browser-to-browser DataChannels
- Ping/pong latency checks
- Remote workload execution
- Basic workload routing using compute score, latency, load, and WebGPU support

## Current architecture

Browser A
→ Supabase for discovery/signaling
→ WebRTC peer connection
→ Browser B executes workload
→ result returned over WebRTC

Supabase is only used for room presence and WebRTC signaling. Workload data is sent directly between peers.

## Remote execution demo

The current proof-of-concept sends:

square(12)

to another connected browser over WebRTC.

The remote node executes the task and returns:

144

## Stack

- React
- TypeScript
- Vite
- WebRTC
- WebGPU capability detection
- Supabase Realtime

## Next

- Configurable remote workloads
- Real peer latency feeding into routing decisions
- Local browser-based ML inference
- Workload scheduling across multiple devices
- AI model routing based on device capabilities
## Ticket workspace

The top of the app now provides a local ticket-triage workflow using the quantized
`Xenova/mobilebert-uncased-mnli` zero-shot classifier via Transformers.js in a
Web Worker. First use downloads model files; tickets are not sent to Hugging Face.
Enter a ticket, classify it, correct/confirm its category, and export JSON before
refreshing. The queue is session-only. Scores are model ranking scores, not
calibrated confidence. All results require human review.

The optional enterprise policy checkbox calls the existing enterprise project's
`POST /route` through the Vite `/enterprise-api` proxy to `127.0.0.1:8000`.
Only `task_type`, `sensitivity`, and `risk_level` are sent. Start that project's
FastAPI application with `python -m uvicorn src.api.main:app --port 8000` from its
root in an environment with its `requirements-api.txt` installed. Errors do not
silently fall back. Policies needing a frontier model or cascade are held for
review because those executors are not connected yet.

Each export includes a Work Unit matching `src/simulation/work_unit.py`, the
original prediction, reviewed category, model identity, and measured timings.
Business value and failure cost currently use explicit prototype defaults (1,
and 10 for high risk); they are not measured financial estimates.

The ticket workflow currently executes on the local browser, separately from the
existing WebRTC demo. Ticket inference across peers and production authentication
are not implemented. The enterprise proxy is a development-server feature; a
hosted deployment needs an equivalent server route to the enterprise service.

Validation: TypeScript and Vite build; real native-runtime model inference on a
billing ticket; enterprise API low/high risk responses through the Vite proxy.
Browser model execution and multi-device ticket execution have not been validated.
