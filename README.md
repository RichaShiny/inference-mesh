# InferenceMesh

**InferenceMesh is a private AI operations layer that routes business tasks across approved models and trusted devices while keeping people in control.**

The first real workflow is customer-support triage. A support request enters the workspace, a browser model suggests its category and priority, company policy determines the approved execution path, and a person reviews the result before work begins. The decision and its execution evidence are saved in a secure team workspace.

## Why this project exists

Most AI products send every request to the same cloud model. That can be expensive, slow, or inappropriate for sensitive data. At the same time, laptops and other ordinary devices increasingly have CPUs and GPUs capable of useful local inference.

InferenceMesh explores a different approach:

> For each AI task, choose the safest and most appropriate available place to run it.

That place might be the current browser, another trusted device, an approved enterprise model, or a verified multi-model workflow. The routing decision can consider privacy, business risk, hardware capability, network latency, current load, and previous execution performance.

## What a user can do today

- Sign in with a secure passwordless email link.
- Work inside an authenticated Supabase workspace.
- Paste a customer-support request or select a realistic example.
- Mark sensitive or high-risk requests before processing.
- Run a real zero-shot classification model inside the browser.
- Review or correct the suggested category.
- Assign an owner and move tickets through open, in-progress, and resolved states.
- Search and filter the operational queue.
- Save tickets and review decisions in Supabase.
- Create a private room and connect a second browser through WebRTC.
- Profile device capabilities, benchmark CPUs, and measure peer latency.
- Recommend a device using capability, latency, load, and execution history.
- Execute the current remote-workload demonstration on another browser.

## What makes InferenceMesh different

The individual technologies already exist. [Transformers.js](https://huggingface.co/docs/transformers.js/) and [WebLLM](https://github.com/mlc-ai/web-llm) run models in browsers. [exo](https://github.com/exo-explore/exo) distributes inference across native devices. Cloud AI gateways route requests among hosted models. Support platforms classify and automate customer conversations.

InferenceMesh combines a different set of concerns in one product:

- A business workflow that nontechnical support teams can operate.
- Local browser inference for requests that should remain on a trusted device.
- Browser-to-browser discovery and execution without installing a native worker.
- Enterprise policy separated from model execution.
- Hardware-aware and history-aware routing.
- Human approval, corrections, ownership, and audit-friendly execution evidence.

The product is currently a working prototype. It demonstrates these layers together; it does not yet claim production scale or benchmark superiority over established inference engines and support platforms.

## How the support workflow works

1. **Intake** — A user adds a support message and marks its sensitivity and failure risk.
2. **Policy** — The optional enterprise router receives task metadata, never the ticket text, and recommends an approved execution strategy.
3. **Inference** — A quantized `Xenova/mobilebert-uncased-mnli` model classifies the text in a Web Worker using Transformers.js. WebGPU is preferred when available, with WebAssembly as the compatibility path.
4. **Human review** — A person can correct the category and must approve the suggestion.
5. **Operations** — The ticket receives an owner and moves through open, in-progress, and resolved states.
6. **Persistence** — Supabase stores the queue inside an authenticated workspace protected by row-level security.

Model scores rank the available categories; they are not calibrated confidence estimates.

## Device mesh architecture

```text
Browser A
  ├─ profiles local hardware
  ├─ creates or joins a private room
  └─ uses Supabase Realtime for presence and signaling
                          │
                          ▼
                 WebRTC DataChannel
                          │
                          ▼
Browser B
  ├─ reports capabilities and latency
  ├─ receives an approved workload
  └─ returns the result and execution telemetry
```

Supabase coordinates room discovery and WebRTC signaling. Peer workload messages travel directly through the WebRTC DataChannel.

## Current limitation

The support classifier currently executes in the browser where the ticket was entered. The connected-device demonstration sends `square(12)` to another browser and returns `144`.

The next major technical milestone is to send a real ticket-classification Work Unit to the selected peer, execute the model there, return the classification, and record why that device was chosen. Completing that path will turn the existing local AI workflow and peer runtime into one end-to-end distributed product.

## Enterprise policy integration

The optional company-policy control calls the enterprise workload-intelligence project's `POST /route` endpoint through the Vite `/enterprise-api` proxy. Only `task_type`, `sensitivity`, and `risk_level` are sent. Ticket text remains in the browser.

Start the enterprise API locally with:

```bash
python -m uvicorn src.api.main:app --port 8000
```

The current browser executor supports the `direct_small` path. Strategies requiring a frontier executor or verified cascade are held for human review until those executors are connected.

## Authentication and data

Supabase Auth provides passwordless email login. A personal workspace is created on first use, and row-level policies restrict ticket access to authenticated workspace members.

Google sign-in appears when `VITE_ENABLE_GOOGLE_AUTH=true`. Enable the Google provider and configure its OAuth credentials and redirect URLs in Supabase before setting that flag.

Apply both migrations in order:

```text
supabase/migrations/20260910010000_create_support_tickets.sql
supabase/migrations/20260910023000_secure_workspaces.sql
```

## Stack

- React 19 and TypeScript
- Vite
- Transformers.js with WebGPU and WebAssembly
- Web Workers
- WebRTC DataChannels
- Supabase Auth, Postgres, Realtime, and row-level security

## Local development

```bash
npm install
npm run dev
```

Create `.env.local` with:

```text
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Optional:

```text
VITE_ENABLE_GOOGLE_AUTH=true
```

## Validation

- TypeScript and Vite production build
- Real browser-model inference on support tickets
- Enterprise policy responses through the local Vite proxy
- Two-browser room discovery, WebRTC connection, latency measurement, and remote demo execution
- Supabase ticket persistence and authenticated workspace policies

## Roadmap

1. Execute real classification Work Units on a selected peer.
2. Import support requests from CSV and connected channels.
3. Detect duplicate incidents and approaching SLA deadlines.
4. Add team invitations and owner roles.
5. Deploy the enterprise router and web application.
6. Add routing-quality, latency, correction-rate, and cost dashboards.
