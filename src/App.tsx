import { useEffect, useState } from "react";
import "./App.css";

import {
  detectDeviceCapabilities,
  type DeviceCapabilities,
} from "./device/capabilities";

import {
  runCpuBenchmark,
  type BenchmarkResult,
} from "./device/benchmark";

import { routeWorkload } from "./routing/router";

import type {
  ComputeNode,
  RoutingResult,
  Workload,
  WorkloadComplexity,
  WorkloadType,
} from "./routing/types";


function createRoomCode() {
  return Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();
}


const initialCapabilities: DeviceCapabilities = {
  cpuCores: null,
  memoryGB: null,
  webGPU: "Checking",
  browser: "Detecting",
  platform: "Detecting",
  deviceType: "Detecting",
};


function App() {
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [activeRoom, setActiveRoom] =
    useState<string | null>(null);

  const [capabilities, setCapabilities] =
    useState<DeviceCapabilities>(
      initialCapabilities
    );

  const [benchmark, setBenchmark] =
    useState<BenchmarkResult | null>(null);

  const [benchmarking, setBenchmarking] =
    useState(false);

  const [workloadType, setWorkloadType] =
    useState<WorkloadType>(
      "summarization"
    );

  const [
    workloadComplexity,
    setWorkloadComplexity,
  ] = useState<WorkloadComplexity>(
    "medium"
  );

  const [
    requiresWebGPU,
    setRequiresWebGPU,
  ] = useState(false);

  const [
    routingResult,
    setRoutingResult,
  ] = useState<RoutingResult | null>(
    null
  );

  const [
    routingMessage,
    setRoutingMessage,
  ] = useState<string | null>(
    null
  );


  useEffect(() => {
    async function loadCapabilities() {
      const detected =
        await detectDeviceCapabilities();

      setCapabilities(detected);
    }

    loadCapabilities();
  }, []);


  const handleCreateRoom = () => {
    const code = createRoomCode();

    setRoomCode(code);
    setActiveRoom(code);
  };


  const handleJoinRoom = () => {
    const code = joinCode
      .trim()
      .toUpperCase();

    if (!code) {
      return;
    }

    setActiveRoom(code);
  };


  const handleBenchmark = async () => {
    setBenchmarking(true);

    try {
      const result =
        await runCpuBenchmark();

      setBenchmark(result);
      setRoutingResult(null);
      setRoutingMessage(null);
    } finally {
      setBenchmarking(false);
    }
  };


  const handleRouteWorkload = () => {
    if (!benchmark) {
      setRoutingResult(null);

      setRoutingMessage(
        "Benchmark this device before routing a workload."
      );

      return;
    }

    const localNode: ComputeNode = {
      id: "local-node",
      name: `${capabilities.platform} ${capabilities.deviceType}`,
      deviceType:
        capabilities.deviceType,
      cpuCores:
        capabilities.cpuCores,
      memoryGB:
        capabilities.memoryGB,
      webGPU:
        capabilities.webGPU ===
        "Supported",
      computeScore:
        benchmark.computeScore,
      latencyMs: 0,
      activeTasks: 0,
      online: true,
    };

    const workload: Workload = {
      id: "demo-workload",
      type: workloadType,
      complexity:
        workloadComplexity,
      requiresWebGPU,
    };

    const result = routeWorkload(
      workload,
      [localNode]
    );

    if (!result) {
      setRoutingResult(null);

      setRoutingMessage(
        "No connected node satisfies this workload."
      );

      return;
    }

    setRoutingResult(result);
    setRoutingMessage(null);
  };


  return (
    <main className="app">
      <header className="navbar">
        <div className="brand">
          <div className="brand-mark">
            IM
          </div>

          <div>
            <h1>InferenceMesh</h1>

            <p>
              Distributed AI across
              your devices
            </p>
          </div>
        </div>

        <div className="status-pill">
          <span className="status-dot" />
          Local node online
        </div>
      </header>


      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            PEER-TO-PEER AI RUNTIME
          </span>

          <h2>
            Turn nearby devices into
            <span>
              {" "}
              one AI compute mesh.
            </span>
          </h2>

          <p>
            Connect browsers, profile
            available compute, route
            workloads intelligently,
            and execute AI tasks across
            heterogeneous edge devices.
          </p>
        </div>


        {!activeRoom ? (
          <div className="room-panel">
            <button
              className="primary-button"
              onClick={handleCreateRoom}
            >
              Create Compute Room
            </button>

            <div className="divider">
              <span />

              <p>
                or join an existing room
              </p>

              <span />
            </div>

            <div className="join-row">
              <input
                value={joinCode}
                onChange={(event) =>
                  setJoinCode(
                    event.target.value
                  )
                }
                placeholder="ROOM CODE"
                maxLength={6}
              />

              <button
                className="secondary-button"
                onClick={handleJoinRoom}
              >
                Join
              </button>
            </div>
          </div>
        ) : (
          <div className="active-room">
            <p>
              ACTIVE COMPUTE ROOM
            </p>

            <strong>
              {activeRoom}
            </strong>

            {roomCode === activeRoom && (
              <span>
                Share this code with
                another device
              </span>
            )}
          </div>
        )}
      </section>


      <section className="dashboard">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              COMPUTE NODES
            </p>

            <h3>
              Connected devices
            </h3>
          </div>

          <span className="node-count">
            1 node
          </span>
        </div>


        <div className="device-grid">
          <article className="device-card">
            <div className="device-header">
              <div>
                <span className="device-label">
                  THIS DEVICE
                </span>

                <h4>
                  {capabilities.deviceType}
                </h4>
              </div>

              <span className="ready-badge">
                Ready
              </span>
            </div>


            <div className="metrics">
              <div className="metric">
                <span>
                  CPU cores
                </span>

                <strong>
                  {capabilities.cpuCores ??
                    "Unknown"}
                </strong>
              </div>

              <div className="metric">
                <span>
                  Memory
                </span>

                <strong>
                  {capabilities.memoryGB
                    ? `${capabilities.memoryGB} GB`
                    : "Unavailable"}
                </strong>
              </div>

              <div className="metric">
                <span>
                  WebGPU
                </span>

                <strong>
                  {capabilities.webGPU}
                </strong>
              </div>

              <div className="metric">
                <span>
                  Browser
                </span>

                <strong>
                  {capabilities.browser}
                </strong>
              </div>

              <div className="metric">
                <span>
                  Platform
                </span>

                <strong>
                  {capabilities.platform}
                </strong>
              </div>

              <div className="metric">
                <span>
                  Tasks
                </span>

                <strong>
                  0
                </strong>
              </div>
            </div>


            <div className="benchmark-section">
              <div>
                <span className="device-label">
                  COMPUTE BENCHMARK
                </span>

                {benchmark ? (
                  <div className="benchmark-results">
                    <div>
                      <span>
                        Compute score
                      </span>

                      <strong>
                        {
                          benchmark.computeScore
                        }
                        /100
                      </strong>
                    </div>

                    <div>
                      <span>
                        Throughput
                      </span>

                      <strong>
                        {(
                          benchmark
                            .operationsPerSecond
                          / 1_000_000
                        ).toFixed(2)}
                        M ops/s
                      </strong>
                    </div>

                    <div>
                      <span>
                        Benchmark time
                      </span>

                      <strong>
                        {
                          benchmark.durationMs
                        }{" "}
                        ms
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p className="benchmark-empty">
                    Benchmark this device
                    before routing workloads.
                  </p>
                )}
              </div>

              <button
                className="benchmark-button"
                onClick={handleBenchmark}
                disabled={benchmarking}
              >
                {benchmarking
                  ? "Benchmarking..."
                  : benchmark
                    ? "Run Again"
                    : "Benchmark Device"}
              </button>
            </div>
          </article>


          <article className="waiting-card">
            <div className="waiting-icon">
              +
            </div>

            <h4>
              Waiting for another device
            </h4>

            <p>
              Join this compute room from
              another browser to add a
              peer to the mesh.
            </p>
          </article>
        </div>
      </section>


      <section className="routing-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              WORKLOAD ROUTER
            </p>

            <h3>
              Route an AI workload
            </h3>
          </div>
        </div>


        <div className="routing-grid">
          <article className="routing-card">
            <div className="routing-field">
              <label>
                Workload type
              </label>

              <select
                value={workloadType}
                onChange={(event) =>
                  setWorkloadType(
                    event.target
                      .value as WorkloadType
                  )
                }
              >
                <option value="classification">
                  Classification
                </option>

                <option value="embedding">
                  Embedding
                </option>

                <option value="summarization">
                  Summarization
                </option>

                <option value="reasoning">
                  Reasoning
                </option>
              </select>
            </div>


            <div className="routing-field">
              <label>
                Complexity
              </label>

              <select
                value={
                  workloadComplexity
                }
                onChange={(event) =>
                  setWorkloadComplexity(
                    event.target
                      .value as WorkloadComplexity
                  )
                }
              >
                <option value="low">
                  Low
                </option>

                <option value="medium">
                  Medium
                </option>

                <option value="high">
                  High
                </option>
              </select>
            </div>


            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={requiresWebGPU}
                onChange={(event) =>
                  setRequiresWebGPU(
                    event.target.checked
                  )
                }
              />

              Require WebGPU
            </label>


            <button
              className="route-button"
              onClick={
                handleRouteWorkload
              }
            >
              Route Workload
            </button>
          </article>


          <article className="routing-result-card">
            <span className="device-label">
              ROUTING DECISION
            </span>

            {routingResult ? (
              <>
                <div className="route-score">
                  <span>
                    Selected node
                  </span>

                  <strong>
                    {
                      routingResult
                        .node.name
                    }
                  </strong>
                </div>

                <div className="route-score">
                  <span>
                    Routing score
                  </span>

                  <strong>
                    {
                      routingResult.score
                    }
                  </strong>
                </div>

                <p className="route-reason">
                  {
                    routingResult.reason
                  }
                </p>
              </>
            ) : (
              <p className="routing-placeholder">
                {routingMessage ??
                  "Configure a workload and run the router to see which node is selected."}
              </p>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}


export default App;