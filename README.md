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