import {
  useEffect,
  useRef,
  useState,
} from "react";

import "./App.css";

import {
  detectDeviceCapabilities,
  type DeviceCapabilities,
} from "./device/capabilities";

import {
  runCpuBenchmark,
  type BenchmarkResult,
} from "./device/benchmark";

import {
  joinComputeRoom,
  type ComputeRoomConnection,
  type NodePresence,
} from "./network/signaling";

import { PeerConnection } from "./network/peer";

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
  const nodeIdRef = useRef(
    crypto.randomUUID()
  );

  const connectionRef =
    useRef<ComputeRoomConnection | null>(
      null
    );

  const peersRef = useRef<
    Map<string, PeerConnection>
  >(new Map());

  const initiatedPeersRef = useRef<
    Set<string>
  >(new Set());

  const [roomCode, setRoomCode] =
    useState("");

  const [joinCode, setJoinCode] =
    useState("");

  const [activeRoom, setActiveRoom] =
    useState<string | null>(null);

  const [roomStatus, setRoomStatus] =
    useState<
      "idle" |
      "connecting" |
      "connected" |
      "error"
    >("idle");

  const [roomError, setRoomError] =
    useState<string | null>(null);

  const [nodes, setNodes] =
    useState<NodePresence[]>([]);

  const [capabilities, setCapabilities] =
    useState<DeviceCapabilities>(
      initialCapabilities
    );

  const [benchmark, setBenchmark] =
    useState<BenchmarkResult | null>(
      null
    );

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


  const buildLocalPresence =
    (): NodePresence => ({
      nodeId: nodeIdRef.current,

      name:
        `${capabilities.platform} ` +
        `${capabilities.deviceType}`,

      deviceType:
        capabilities.deviceType,

      platform:
        capabilities.platform,

      browser:
        capabilities.browser,

      cpuCores:
        capabilities.cpuCores,

      memoryGB:
        capabilities.memoryGB,

      webGPU:
        capabilities.webGPU ===
        "Supported",

      computeScore:
        benchmark?.computeScore ??
        null,

      activeTasks: 0,

      onlineAt:
        new Date().toISOString(),
    });


  const closePeerConnections = () => {
    for (
      const peer
      of peersRef.current.values()
    ) {
      peer.close();
    }

    peersRef.current.clear();

    initiatedPeersRef.current.clear();
  };


  const getOrCreatePeer = (
    remoteNodeId: string
  ): PeerConnection => {
    const existing =
      peersRef.current.get(
        remoteNodeId
      );

    if (existing) {
      return existing;
    }

    let peer: PeerConnection;

    peer = new PeerConnection(
      nodeIdRef.current,
      remoteNodeId,
      {
        onSignal: async (signal) => {
          const connection =
            connectionRef.current;

          if (!connection) {
            console.warn(
              "Cannot send WebRTC signal without an active room connection."
            );

            return;
          }

          await connection.sendSignal(
            signal
          );
        },

        onMessage: (message) => {
          if (
            message.type === "ping"
          ) {
            peer.send({
              type: "pong",
              timestamp:
                message.timestamp,
            });

            return;
          }

          if (
            message.type === "pong"
          ) {
            const roundTripMs =
              Math.round(
                performance.now() -
                message.timestamp
              );

            console.log(
              `WebRTC peer ${remoteNodeId} round-trip latency: ${roundTripMs} ms`
            );

            return;
          }

          console.log(
            "Peer message received:",
            message
          );
        },

        onOpen: () => {
          console.log(
            `WebRTC data channel open: ${remoteNodeId}`
          );

          peer.send({
            type: "ping",
            timestamp:
              performance.now(),
          });
        },

        onClose: () => {
          console.log(
            `WebRTC data channel closed: ${remoteNodeId}`
          );

          peersRef.current.delete(
            remoteNodeId
          );

          initiatedPeersRef.current.delete(
            remoteNodeId
          );
        },
      }
    );

    peersRef.current.set(
      remoteNodeId,
      peer
    );

    return peer;
  };


  useEffect(() => {
    async function loadCapabilities() {
      const detected =
        await detectDeviceCapabilities();

      setCapabilities(detected);
    }

    loadCapabilities();
  }, []);


  useEffect(() => {
    const connection =
      connectionRef.current;

    if (!connection) {
      return;
    }

    connection
      .updatePresence(
        buildLocalPresence()
      )
      .catch((error) => {
        console.error(
          "Presence update failed:",
          error
        );
      });
  }, [
    capabilities,
    benchmark,
  ]);


  useEffect(() => {
    return () => {
      closePeerConnections();

      const connection =
        connectionRef.current;

      if (connection) {
        void connection.leave();
      }
    };
  }, []);


  useEffect(() => {
    if (
      !activeRoom ||
      !connectionRef.current
    ) {
      return;
    }

    const remotePresenceNodes =
      nodes.filter(
        (node) =>
          node.nodeId !==
          nodeIdRef.current
      );

    const activeRemoteIds =
      new Set(
        remotePresenceNodes.map(
          (node) => node.nodeId
        )
      );

    for (
      const [
        remoteNodeId,
        peer,
      ]
      of peersRef.current
    ) {
      if (
        !activeRemoteIds.has(
          remoteNodeId
        )
      ) {
        peer.close();
      }
    }

    for (
      const remoteNode
      of remotePresenceNodes
    ) {
      const peer =
        getOrCreatePeer(
          remoteNode.nodeId
        );

      const shouldInitiate =
        nodeIdRef.current.localeCompare(
          remoteNode.nodeId
        ) < 0;

      if (
        !shouldInitiate ||
        initiatedPeersRef.current.has(
          remoteNode.nodeId
        )
      ) {
        continue;
      }

      initiatedPeersRef.current.add(
        remoteNode.nodeId
      );

      peer.start().catch(
        (error) => {
          console.error(
            "WebRTC offer failed:",
            error
          );

          initiatedPeersRef.current.delete(
            remoteNode.nodeId
          );
        }
      );
    }
  }, [
    activeRoom,
    nodes,
  ]);


  const connectToRoom = async (
    code: string,
    createdLocally: boolean
  ) => {
    const normalizedCode =
      code.trim().toUpperCase();

    if (!normalizedCode) {
      return;
    }

    setRoomStatus("connecting");
    setRoomError(null);

    try {
      if (
        connectionRef.current
      ) {
        await connectionRef
          .current
          .leave();

        connectionRef.current =
          null;
      }

      closePeerConnections();

      setNodes([]);

      const connection =
        await joinComputeRoom(
          normalizedCode,
          buildLocalPresence(),

          (presenceNodes) => {
            setNodes(
              presenceNodes
            );
          },

          async (signal) => {
            const peer =
              getOrCreatePeer(
                signal.from
              );

            await peer.handleSignal(
              signal
            );
          }
        );

      connectionRef.current =
        connection;

      setActiveRoom(
        normalizedCode
      );

      setRoomCode(
        createdLocally
          ? normalizedCode
          : ""
      );

      setRoomStatus(
        "connected"
      );
    } catch (error) {
      console.error(
        "Room connection failed:",
        error
      );

      setRoomStatus("error");

      setRoomError(
        error instanceof Error
          ? error.message
          : "Unable to connect to room."
      );
    }
  };


  const handleCreateRoom =
    async () => {
      const code =
        createRoomCode();

      setRoomCode(code);
      setActiveRoom(code);

      await connectToRoom(
        code,
        true
      );
    };


  const handleJoinRoom =
    async () => {
      await connectToRoom(
        joinCode,
        false
      );
    };


  const handleLeaveRoom =
    async () => {
      closePeerConnections();

      if (
        connectionRef.current
      ) {
        await connectionRef
          .current
          .leave();
      }

      connectionRef.current =
        null;

      setNodes([]);
      setActiveRoom(null);
      setRoomCode("");
      setJoinCode("");
      setRoomStatus("idle");
      setRoomError(null);
    };


  const handleBenchmark =
    async () => {
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


  const presenceToComputeNode = (
    node: NodePresence
  ): ComputeNode => ({
    id: node.nodeId,

    name: node.name,

    deviceType:
      node.deviceType,

    cpuCores:
      node.cpuCores,

    memoryGB:
      node.memoryGB,

    webGPU:
      node.webGPU,

    computeScore:
      node.computeScore,

    latencyMs: null,

    activeTasks:
      node.activeTasks,

    online: true,
  });


  const handleRouteWorkload =
    () => {
      let routingNodes:
        ComputeNode[];

      if (
        activeRoom &&
        nodes.length > 0
      ) {
        routingNodes =
          nodes.map(
            presenceToComputeNode
          );
      } else {
        routingNodes = [
          presenceToComputeNode(
            buildLocalPresence()
          ),
        ];
      }

      const workload:
        Workload = {
          id:
            crypto.randomUUID(),

          type:
            workloadType,

          complexity:
            workloadComplexity,

          requiresWebGPU,
        };

      const result =
        routeWorkload(
          workload,
          routingNodes
        );

      if (!result) {
        setRoutingResult(
          null
        );

        setRoutingMessage(
          "No connected node satisfies this workload. Make sure at least one node has been benchmarked."
        );

        return;
      }

      setRoutingResult(
        result
      );

      setRoutingMessage(
        null
      );
    };


  const remoteNodes =
    nodes.filter(
      (node) =>
        node.nodeId !==
        nodeIdRef.current
    );


  const nodeCount =
    activeRoom
      ? Math.max(
          nodes.length,
          1
        )
      : 1;


  return (
    <main className="app">
      <header className="navbar">
        <div className="brand">
          <div className="brand-mark">
            IM
          </div>

          <div>
            <h1>
              InferenceMesh
            </h1>

            <p>
              Distributed AI across
              your devices
            </p>
          </div>
        </div>

        <div className="status-pill">
          <span
            className="status-dot"
          />

          {activeRoom
            ? `${nodeCount} node${
                nodeCount === 1
                  ? ""
                  : "s"
              } online`
            : "Local node online"}
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
              onClick={
                handleCreateRoom
              }
              disabled={
                roomStatus ===
                "connecting"
              }
            >
              {roomStatus ===
              "connecting"
                ? "Connecting..."
                : "Create Compute Room"}
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
                onChange={(
                  event
                ) =>
                  setJoinCode(
                    event.target.value
                  )
                }
                placeholder="ROOM CODE"
                maxLength={6}
              />

              <button
                className="secondary-button"
                onClick={
                  handleJoinRoom
                }
                disabled={
                  roomStatus ===
                    "connecting"
                }
              >
                Join
              </button>
            </div>

            {roomError && (
              <p className="room-error">
                {roomError}
              </p>
            )}
          </div>
        ) : (
          <div className="active-room">
            <p>
              ACTIVE COMPUTE ROOM
            </p>

            <strong>
              {activeRoom}
            </strong>

            <span>
              {nodeCount} connected
              {" "}
              {nodeCount === 1
                ? "node"
                : "nodes"}
            </span>

            {roomCode ===
              activeRoom && (
              <span>
                Share this code with
                another device
              </span>
            )}

            <button
              className="secondary-button"
              onClick={
                handleLeaveRoom
              }
            >
              Leave Room
            </button>
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
            {nodeCount}{" "}
            {nodeCount === 1
              ? "node"
              : "nodes"}
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
                  {
                    capabilities
                      .deviceType
                  }
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
                  {
                    capabilities
                      .cpuCores ??
                    "Unknown"
                  }
                </strong>
              </div>

              <div className="metric">
                <span>
                  Memory
                </span>

                <strong>
                  {
                    capabilities
                      .memoryGB
                      ? `${capabilities.memoryGB} GB`
                      : "Unavailable"
                  }
                </strong>
              </div>

              <div className="metric">
                <span>
                  WebGPU
                </span>

                <strong>
                  {
                    capabilities
                      .webGPU
                  }
                </strong>
              </div>

              <div className="metric">
                <span>
                  Browser
                </span>

                <strong>
                  {
                    capabilities
                      .browser
                  }
                </strong>
              </div>

              <div className="metric">
                <span>
                  Platform
                </span>

                <strong>
                  {
                    capabilities
                      .platform
                  }
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
                          benchmark
                            .computeScore
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
                            .operationsPerSecond /
                          1_000_000
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
                          benchmark
                            .durationMs
                        }{" "}
                        ms
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p className="benchmark-empty">
                    Benchmark this device
                    before routing
                    workloads.
                  </p>
                )}
              </div>

              <button
                className="benchmark-button"
                onClick={
                  handleBenchmark
                }
                disabled={
                  benchmarking
                }
              >
                {benchmarking
                  ? "Benchmarking..."
                  : benchmark
                    ? "Run Again"
                    : "Benchmark Device"}
              </button>
            </div>
          </article>


          {remoteNodes.map(
            (node) => (
              <article
                className="device-card"
                key={node.nodeId}
              >
                <div className="device-header">
                  <div>
                    <span className="device-label">
                      REMOTE NODE
                    </span>

                    <h4>
                      {node.name}
                    </h4>
                  </div>

                  <span className="ready-badge">
                    Online
                  </span>
                </div>

                <div className="metrics">
                  <div className="metric">
                    <span>
                      CPU cores
                    </span>

                    <strong>
                      {node.cpuCores ??
                        "Unknown"}
                    </strong>
                  </div>

                  <div className="metric">
                    <span>
                      Memory
                    </span>

                    <strong>
                      {node.memoryGB
                        ? `${node.memoryGB} GB`
                        : "Unavailable"}
                    </strong>
                  </div>

                  <div className="metric">
                    <span>
                      WebGPU
                    </span>

                    <strong>
                      {node.webGPU
                        ? "Supported"
                        : "Unavailable"}
                    </strong>
                  </div>

                  <div className="metric">
                    <span>
                      Compute score
                    </span>

                    <strong>
                      {node.computeScore ??
                        "Not benchmarked"}
                    </strong>
                  </div>

                  <div className="metric">
                    <span>
                      Browser
                    </span>

                    <strong>
                      {node.browser}
                    </strong>
                  </div>

                  <div className="metric">
                    <span>
                      Platform
                    </span>

                    <strong>
                      {node.platform}
                    </strong>
                  </div>
                </div>
              </article>
            )
          )}


          {remoteNodes.length ===
            0 && (
            <article className="waiting-card">
              <div className="waiting-icon">
                +
              </div>

              <h4>
                Waiting for another
                device
              </h4>

              <p>
                {activeRoom
                  ? `Join room ${activeRoom} from another browser to add a peer to the mesh.`
                  : "Create or join a compute room to discover another node."}
              </p>
            </article>
          )}
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
                onChange={(
                  event
                ) =>
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
                onChange={(
                  event
                ) =>
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
                checked={
                  requiresWebGPU
                }
                onChange={(
                  event
                ) =>
                  setRequiresWebGPU(
                    event.target
                      .checked
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
                      routingResult
                        .score
                    }
                  </strong>
                </div>

                <p className="route-reason">
                  {
                    routingResult
                      .reason
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