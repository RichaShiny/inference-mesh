import { useEffect, useRef, useState } from "react";
import "./tickets.css";
const categories = [
  "billing and payments",
  "account access",
  "technical issue",
  "product question",
];
type Ticket = {
  id: string;
  text: string;
  category: string;
  predictedCategory: string;
  model: string;
  score: number;
  inferenceMs: number;
  totalMs: number;
  reviewed: boolean;
  policy: string;
  timestamp: string;
  workUnit: Record<string, string | number>;
};
export default function TicketDesk() {
  const [text, setText] = useState("");
  const [sensitivity, setSensitivity] = useState("low");
  const [risk, setRisk] = useState("low");
  const [enterprise, setEnterprise] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const worker = useRef<Worker | null>(null);
  const pending = useRef<{
    text: string;
    policy: string;
    workUnit: Ticket["workUnit"];
  } | null>(null);
  const requestId = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      worker.current?.terminate();
      if (timeout.current) clearTimeout(timeout.current);
    },
    [],
  );
  function stop() {
    requestId.current += 1;
    worker.current?.terminate();
    worker.current = null;
    pending.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    setBusy(false);
    setStatus("Cancelled. No ticket added.");
  }
  async function run() {
    if (busy || !text.trim()) return;
    const currentRequest = ++requestId.current;
    setBusy(true);
    setError("");
    setStatus("Preparing ticket…");
    const input = text.trim();
    const workUnit = {
      workload_id: crypto.randomUUID(),
      task_type: "classification",
      complexity: 0.3,
      sensitivity,
      business_value: 1,
      failure_cost: risk === "high" ? 10 : 1,
      escalation_cost: 0,
    };
    try {
      let policy = "Local classification · enterprise API not requested";
      if (enterprise) {
        setStatus("Requesting enterprise routing policy…");
        const response = await fetch("/enterprise-api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_type: workUnit.task_type,
            sensitivity,
            risk_level: risk,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok)
          throw new Error(
            "Enterprise routing API is unavailable. Start the enterprise API or turn off enterprise policy to run locally.",
          );
        const data = await response.json();
        if (currentRequest !== requestId.current) return;
        if (
          !["direct_small", "direct_frontier", "verified_cascade"].includes(
            data.recommended_strategy,
          )
        )
          throw new Error("Enterprise API returned an invalid policy.");
        policy = `Enterprise policy: ${data.recommended_strategy}`;
        if (data.recommended_strategy !== "direct_small") {
          setStatus(
            `${policy}. Human review required: a frontier executor is not configured. No model was run.`,
          );
          setBusy(false);
          return;
        }
      }
      pending.current = { text: input, policy, workUnit };
      worker.current ??= new Worker(
        new URL("./model.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current.onmessage = (event) => {
        const message = event.data;
        if (message.type === "progress") {
          setStatus(message.message);
          return;
        }
        if (timeout.current) clearTimeout(timeout.current);
        setBusy(false);
        if (message.type === "error") {
          setError(message.message);
          return;
        }
        const current = pending.current;
        if (!current) return;
        const { labels, scores } = message.result;
        setTickets((previous) => [
          {
            ...current,
            id: crypto.randomUUID(),
            category: labels[0],
            predictedCategory: labels[0],
            model: "Xenova/mobilebert-uncased-mnli",
            score: scores[0],
            inferenceMs: message.inferenceMs,
            totalMs: message.totalMs,
            reviewed: false,
            timestamp: new Date().toISOString(),
          },
          ...previous,
        ]);
        pending.current = null;
        setStatus(
          "Classification complete. Review the category before using it.",
        );
      };
      worker.current.onerror = () => {
        stop();
        setError("The model worker failed. Please retry.");
      };
      timeout.current = setTimeout(() => {
        stop();
        setError(
          "Model download or inference timed out after 3 minutes. Check your connection and retry.",
        );
      }, 180000);
      worker.current.postMessage({ text: input });
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      setBusy(false);
      setError(e instanceof Error ? e.message : "Unable to process ticket.");
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(tickets, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "inferencemesh-tickets.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="ticket-desk">
      <div className="desk-heading">
        <div>
          <p className="eyebrow">ENTERPRISE WORKLOADS / SUPPORT OPERATIONS</p>
          <h2>Turn incoming tickets into a reviewable queue.</h2>
          <p>
            Real model inference on this device. A clear decision for every
            ticket.
          </p>
        </div>
        <span className="ready-badge">Local execution</span>
      </div>
      <div className="desk-grid">
        <article className="desk-panel">
          <h3>New support ticket</h3>
          <label htmlFor="ticket-text">Customer message</label>
          <textarea
            id="ticket-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={6}
            placeholder="Paste a customer’s support request…"
            disabled={busy}
          />
          <div className="desk-meta">
            <span>{text.length}/2,000 characters</span>
            <button
              disabled={busy}
              onClick={() =>
                setText(
                  "I was charged twice for my subscription this month. Please refund the duplicate payment.",
                )
              }
            >
              Use example
            </button>
          </div>
          <div className="desk-grid">
            <label>
              Sensitivity
              <select
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value)}
                disabled={busy}
              >
                <option value="low">Low</option>
                <option value="high">High — keep local</option>
              </select>
            </label>
            <label>
              Failure risk
              <select
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
                disabled={busy}
              >
                <option value="low">Low</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <label className="desk-check">
            <input
              type="checkbox"
              checked={enterprise}
              onChange={(e) => setEnterprise(e.target.checked)}
              disabled={busy}
            />
            Use enterprise routing API
          </label>
          <p className="desk-help">
            The API receives task metadata only. Ticket text stays in this
            browser. First use downloads model files from Hugging Face. Model
            scores are not calibrated confidence.
          </p>
          <button
            className="primary-button"
            onClick={() => void run()}
            disabled={busy || !text.trim()}
          >
            {busy ? "Processing…" : "Classify ticket"}
          </button>
          {busy && <button onClick={stop}>Cancel</button>}
          <p role="status">{status}</p>
          {error && (
            <p role="alert" className="room-error">
              {error}
            </p>
          )}
        </article>
        <article className="desk-panel">
          <div className="desk-heading">
            <h3>
              Review queue <span className="node-count">{tickets.length}</span>
            </h3>
            <button disabled={!tickets.length} onClick={download}>
              Export JSON
            </button>
          </div>
          {!tickets.length ? (
            <div className="desk-empty">
              <h3>Your first ticket starts here.</h3>
              <p>
                Enter a message and classify it. Results appear here with
                measured execution time and a Work Unit that matches your
                enterprise project.
              </p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <div className="ticket-row" key={ticket.id}>
                <div className="desk-meta">
                  <strong>
                    {ticket.reviewed ? "Reviewed" : "Needs review"}
                  </strong>
                  <span>{Math.round(ticket.inferenceMs)} ms inference</span>
                </div>
                <p>{ticket.text}</p>
                <label>
                  Assigned category
                  <select
                    value={ticket.category}
                    onChange={(e) =>
                      setTickets((items) =>
                        items.map((t) =>
                          t.id === ticket.id
                            ? {
                                ...t,
                                category: e.target.value,
                                reviewed: false,
                              }
                            : t,
                        ),
                      )
                    }
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <p className="desk-help">
                  Original prediction: {ticket.predictedCategory} · Top model
                  score: {(ticket.score * 100).toFixed(1)}% · Total including
                  loading: {(ticket.totalMs / 1000).toFixed(2)} s<br />
                  {ticket.policy}
                </p>
                <button
                  onClick={() =>
                    setTickets((items) =>
                      items.map((t) =>
                        t.id === ticket.id ? { ...t, reviewed: true } : t,
                      ),
                    )
                  }
                  disabled={ticket.reviewed}
                >
                  Confirm category
                </button>
              </div>
            ))
          )}
          <p className="desk-help">
            Session-only queue. Export to keep your work before refreshing. This
            workflow runs locally; peer demo controls are below.
          </p>
        </article>
      </div>
    </section>
  );
}
