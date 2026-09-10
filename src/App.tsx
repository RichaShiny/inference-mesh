import TicketDesk from "./tickets/TicketDesk";
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
  executeRemoteWorkload,
} from "./execution/remote";

import type {
  RemoteWorkloadPayload,
} from "./network/messages";

import { PeerConnection } from "./network/peer";

import {
  joinComputeRoom,
  type ComputeRoomConnection,
  type NodePresence,
} from "./network/signaling";

import { routeWorkload } from "./routing/router";

import type {
  ComputeNode,
  RoutingResult,
  Workload,
  WorkloadComplexity,
  WorkloadType,
} from "./routing/types";

import {
  getExecutionHistory,
  recordExecution,
} from "./telemetry/store";

import type {
  ExecutionTelemetry,
} from "./telemetry/types";


function createRoomCode() {
  return Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();
}


function roundMs(
  value: number
): number {
  return Math.round(
    value * 100
  ) / 100;
}


function formatAdjustment(
  value: number
): string {
  if (value > 0) {
    return `+${value}`;
  }

  return String(value);
}


const initialCapabilities: DeviceCapabilities = {
  cpuCores: null,
  memoryGB: null,
  webGPU: "Checking",
  browser: "Detecting",
  platform: "Detecting",
  deviceType: "Detecting",
};


type PendingRoutedExecution = {
  workload: Workload;
  routingResult: RoutingResult;
  startedAt: number;
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

  const pendingWorkloadIdRef =
    useRef<string | null>(
      null
    );

  const pendingRoutedExecutionRef =
    useRef<
      PendingRoutedExecution | null
    >(null);

  const peerLatenciesRef = useRef<
    Map<string, number>
  >(new Map());


  const [roomCode, setRoomCode] =
    useState("");

  const [joinCode, setJoinCode] =
    useState("");

  const [activeRoom, setActiveRoom] =
    useState<string | null>(
      null
    );

  const [roomStatus, setRoomStatus] =
    useState<
      "idle" |
      "connecting" |
      "connected" |
      "error"
    >("idle");

  const [roomError, setRoomError] =
    useState<string | null>(
      null
    );

  const [nodes, setNodes] =
    useState<NodePresence[]>(
      []
    );

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

  const [
    remoteExecutionStatus,
    setRemoteExecutionStatus,
  ] = useState<
    "idle" |
    "running" |
    "success" |
    "error"
  >("idle");

  const [
    remoteExecutionResult,
    setRemoteExecutionResult,
  ] = useState<string | null>(
    null
  );

  const [
    executionHistory,
    setExecutionHistory,
  ] = useState<ExecutionTelemetry[]>(
    () => getExecutionHistory()
  );


  const saveTelemetry = (
    telemetry: ExecutionTelemetry
  ) => {
    recordExecution(
      telemetry
    );

    setExecutionHistory(
      getExecutionHistory()
    );
  };


  const buildLocalPresence =
    (): NodePresence => ({
      nodeId:
        nodeIdRef.current,

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

    peerLatenciesRef.current.clear();

    pendingWorkloadIdRef.current =
      null;

    pendingRoutedExecutionRef.current =
      null;
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

            peerLatenciesRef.current.set(
              remoteNodeId,
              roundTripMs
            );

            console.log(
              `WebRTC peer ${remoteNodeId} round-trip latency: ${roundTripMs} ms`
            );

            return;
          }

          if (
            message.type === "workload"
          ) {
            const startedAt =
              performance.now();

            try {
              const result =
                executeRemoteWorkload(
                  message.payload
                );

              const executionMs =
                roundMs(
                  performance.now() -
                  startedAt
                );

              peer.send({
                type: "result",

                workloadId:
                  message.workloadId,

                success: true,

                result,

                executionMs,
              });

              console.log(
                "Executed remote workload:",
                message.workloadId,
                result,
                `${executionMs} ms`
              );
            } catch (error) {
              const executionMs =
                roundMs(
                  performance.now() -
                  startedAt
                );

              peer.send({
                type: "result",

                workloadId:
                  message.workloadId,

                success: false,

                error:
                  error instanceof Error
                    ? error.message
                    : "Workload execution failed.",

                executionMs,
              });
            }

            return;
          }

          if (
            message.type === "result"
          ) {
            if (
              message.workloadId !==
              pendingWorkloadIdRef.current
            ) {
              return;
            }

            const pending =
              pendingRoutedExecutionRef.current;

            const totalLatencyMs =
              pending
                ? roundMs(
                    performance.now() -
                    pending.startedAt
                  )
                : message.executionMs;

            if (
              pending &&
              pending.workload.id ===
                message.workloadId
            ) {
              saveTelemetry({
                id:
                  crypto.randomUUID(),

                workloadId:
                  pending.workload.id,

                workloadType:
                  pending.workload.type,

                complexity:
                  pending.workload
                    .complexity,

                nodeId:
                  pending.routingResult
                    .node.id,

                nodeName:
                  pending.routingResult
                    .node.name,

                executionLocation:
                  "remote",

                routingScore:
                  pending.routingResult
                    .score,

                networkLatencyMs:
                  pending.routingResult
                    .node.latencyMs,

                executionMs:
                  message.executionMs,

                totalLatencyMs,

                success:
                  message.success,

                timestamp:
                  new Date()
                    .toISOString(),
              });
            }

            if (
              message.success === false
            ) {
              console.error(
                "Remote workload failed:",
                message.workloadId,
                message.error,
                `${message.executionMs} ms`
              );

              setRemoteExecutionResult(
                message.error
              );

              setRemoteExecutionStatus(
                "error"
              );
            } else {
              console.log(
                "Remote workload result:",
                message.workloadId,
                message.result,
                `${message.executionMs} ms`
              );

              setRemoteExecutionResult(
                String(
                  message.result
                )
              );

              setRemoteExecutionStatus(
                "success"
              );
            }

            pendingWorkloadIdRef.current =
              null;

            pendingRoutedExecutionRef.current =
              null;

            return;
          }
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

          peerLatenciesRef.current.delete(
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

      setCapabilities(
        detected
      );
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
          (node) =>
            node.nodeId
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

    setRoomStatus(
      "connecting"
    );

    setRoomError(
      null
    );

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

      setRoomStatus(
        "error"
      );

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

      setRoomCode(
        code
      );

      setActiveRoom(
        code
      );

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

      setActiveRoom(
        null
      );

      setRoomCode("");

      setJoinCode("");

      setRoomStatus(
        "idle"
      );

      setRoomError(
        null
      );

      setRemoteExecutionStatus(
        "idle"
      );

      setRemoteExecutionResult(
        null
      );
    };


  const handleBenchmark =
    async () => {
      setBenchmarking(
        true
      );

      try {
        const result =
          await runCpuBenchmark();

        setBenchmark(
          result
        );

        setRoutingResult(
          null
        );

        setRoutingMessage(
          null
        );
      } finally {
        setBenchmarking(
          false
        );
      }
    };


  const presenceToComputeNode = (
    node: NodePresence
  ): ComputeNode => ({
    id:
      node.nodeId,

    name:
      node.name,

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

    latencyMs:
      node.nodeId ===
      nodeIdRef.current
        ? 0
        : peerLatenciesRef
            .current
            .get(
              node.nodeId
            ) ?? null,

    activeTasks:
      node.activeTasks,

    online: true,
  });


  const buildWorkloadPayload = (
    workload: Workload
  ): RemoteWorkloadPayload => {
    if (
      workload.type ===
      "classification"
    ) {
      return {
        operation:
          "classification",

        text:
          "Customer cannot login to their account and needs a password reset.",
      };
    }

    if (
      workload.type ===
      "embedding"
    ) {
      return {
        operation:
          "embedding",

        text:
          "Enterprise AI inference routing across distributed compute.",
      };
    }

    if (
      workload.type ===
      "summarization"
    ) {
      return {
        operation:
          "summarization",

        text:
          "Inference Mesh connects heterogeneous devices into a shared compute layer and routes workloads according to compute capability, latency, current load, and hardware requirements.",
      };
    }

    return {
      operation:
        "reasoning",

      values: [
        12,
        7,
        19,
        4,
        23,
        8,
      ],
    };
  };


  const executeOnSelectedNode = (
    result: RoutingResult,
    workload: Workload
  ) => {
    const payload =
      buildWorkloadPayload(
        workload
      );

    if (
      result.node.id ===
      nodeIdRef.current
    ) {
      const startedAt =
        performance.now();

      setRemoteExecutionStatus(
        "running"
      );

      setRemoteExecutionResult(
        null
      );

      try {
        const localResult =
          executeRemoteWorkload(
            payload
          );

        const executionMs =
          roundMs(
            performance.now() -
            startedAt
          );

        saveTelemetry({
          id:
            crypto.randomUUID(),

          workloadId:
            workload.id,

          workloadType:
            workload.type,

          complexity:
            workload.complexity,

          nodeId:
            result.node.id,

          nodeName:
            result.node.name,

          executionLocation:
            "local",

          routingScore:
            result.score,

          networkLatencyMs:
            0,

          executionMs,

          totalLatencyMs:
            executionMs,

          success:
            true,

          timestamp:
            new Date()
              .toISOString(),
        });

        console.log(
          "Executed local workload:",
          workload.id,
          localResult,
          `${executionMs} ms`
        );

        setRemoteExecutionResult(
          String(
            localResult
          )
        );

        setRemoteExecutionStatus(
          "success"
        );
      } catch (error) {
        const executionMs =
          roundMs(
            performance.now() -
            startedAt
          );

        saveTelemetry({
          id:
            crypto.randomUUID(),

          workloadId:
            workload.id,

          workloadType:
            workload.type,

          complexity:
            workload.complexity,

          nodeId:
            result.node.id,

          nodeName:
            result.node.name,

          executionLocation:
            "local",

          routingScore:
            result.score,

          networkLatencyMs:
            0,

          executionMs,

          totalLatencyMs:
            executionMs,

          success:
            false,

          timestamp:
            new Date()
              .toISOString(),
        });

        setRemoteExecutionResult(
          error instanceof Error
            ? error.message
            : "Local workload failed."
        );

        setRemoteExecutionStatus(
          "error"
        );
      }

      return;
    }

    const peer =
      peersRef.current.get(
        result.node.id
      );

    if (!peer) {
      setRemoteExecutionStatus(
        "error"
      );

      setRemoteExecutionResult(
        "Selected peer is not ready."
      );

      return;
    }

    pendingWorkloadIdRef.current =
      workload.id;

    pendingRoutedExecutionRef.current = {
      workload,

      routingResult:
        result,

      startedAt:
        performance.now(),
    };

    setRemoteExecutionStatus(
      "running"
    );

    setRemoteExecutionResult(
      null
    );

    const sent =
      peer.send({
        type:
          "workload",

        workloadId:
          workload.id,

        payload,
      });

    if (!sent) {
      pendingWorkloadIdRef.current =
        null;

      pendingRoutedExecutionRef.current =
        null;

      setRemoteExecutionStatus(
        "error"
      );

      setRemoteExecutionResult(
        "Selected node's WebRTC channel is not open."
      );
    }
  };


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
          routingNodes,
          executionHistory
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

      executeOnSelectedNode(
        result,
        workload
      );
    };


  const handleRemoteTest = (
    remoteNodeId: string
  ) => {
    const peer =
      peersRef.current.get(
        remoteNodeId
      );

    if (!peer) {
      setRemoteExecutionStatus(
        "error"
      );

      setRemoteExecutionResult(
        "Peer connection is not ready."
      );

      return;
    }

    const workloadId =
      crypto.randomUUID();

    pendingWorkloadIdRef.current =
      workloadId;

    pendingRoutedExecutionRef.current =
      null;

    setRemoteExecutionStatus(
      "running"
    );

    setRemoteExecutionResult(
      null
    );

    const sent =
      peer.send({
        type:
          "workload",

        workloadId,

        payload: {
          operation:
            "square",

          value: 12,
        },
      });

    if (!sent) {
      pendingWorkloadIdRef.current =
        null;

      setRemoteExecutionStatus(
        "error"
      );

      setRemoteExecutionResult(
        "WebRTC data channel is not open."
      );
    }
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
              Distributed AI across your devices
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
      <TicketDesk />


      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            OPTIONAL DEVICE SHARING
          </span>

          <h2>
            Use another trusted device
            <span>
              {" "}
              when it is the better place to run AI.
            </span>
          </h2>

          <p>
            Create a private room and share its six-character code with
            another browser. InferenceMesh can then compare the devices and
            send a task to the better fit.
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
                : "Create a private room"}
            </button>

            <div className="divider">
              <span />

              <p>
                Have a room code?
              </p>

              <span />
            </div>

            <div className="join-row">
              <input
                value={
                  joinCode
                }
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
              PRIVATE ROOM
            </p>

            <strong>
              {activeRoom}
            </strong>

            <span>
              {nodeCount} connected{" "}
              {nodeCount === 1
                ? "node"
                : "nodes"}
            </span>

            {roomCode ===
              activeRoom && (
              <span>
                Share this code with a trusted device. It only joins this live session.
              </span>
            )}

            <button
              className="secondary-button"
              onClick={
                handleLeaveRoom
              }
            >
                Leave room
            </button>
          </div>
        )}
      </section>


      <section className="dashboard">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              AVAILABLE DEVICES
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
                DEVICE SPEED CHECK
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
                    Run a quick speed check before choosing where a task should run.
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
                    : "Check device speed"}
              </button>
            </div>
          </article>


          {remoteNodes.map(
            (node) => (
              <article
                className="device-card"
                key={
                  node.nodeId
                }
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


                <div className="benchmark-section">
                  <div>
                    <span className="device-label">
                      REMOTE EXECUTION
                    </span>

                    <p className="benchmark-empty">
                      Test workload: square(12)
                    </p>

                    {remoteExecutionStatus ===
                      "running" && (
                      <p>
                        Running remotely...
                      </p>
                    )}

                    {remoteExecutionResult && (
                      <p>
                        Result:{" "}
                        <strong>
                          {
                            remoteExecutionResult
                          }
                        </strong>
                      </p>
                    )}
                  </div>

                  <button
                    className="benchmark-button"
                    onClick={() =>
                      handleRemoteTest(
                        node.nodeId
                      )
                    }
                    disabled={
                      remoteExecutionStatus ===
                        "running"
                    }
                  >
                    {remoteExecutionStatus ===
                    "running"
                      ? "Running..."
                      : "Run on Remote Node"}
                  </button>
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
                Ready for another device
              </h4>

              <p>
                {activeRoom
                  ? `Open InferenceMesh on another trusted browser and enter ${activeRoom}.`
                  : "Create or join a private room when you want to share work with another device."}
              </p>
            </article>
          )}
        </div>
      </section>


      <section className="routing-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              DEVICE RECOMMENDATION
            </p>

            <h3>
              Choose the best device for a task
            </h3>
          </div>
        </div>


        <div className="routing-grid">
          <article className="routing-card">
            <div className="routing-field">
              <label>
                Task type
              </label>

              <select
                value={
                  workloadType
                }
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
                Task difficulty
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

              Needs graphics acceleration
            </label>


            <button
              className="route-button"
              onClick={
                handleRouteWorkload
              }
            >
              Recommend a device
            </button>
          </article>


          <article className="routing-result-card">
            <span className="device-label">
              RECOMMENDATION
            </span>

            {routingResult ? (
              <>
                <div className="route-score">
                  <span>
                    Best available device
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
                    Base score
                  </span>

                  <strong>
                    {
                      routingResult
                        .baseScore
                    }
                  </strong>
                </div>

                <div className="route-score">
                  <span>
                    Historical adjustment
                  </span>

                  <strong>
                    {formatAdjustment(
                      routingResult
                        .historicalAdjustment
                    )}
                  </strong>
                </div>

                <div className="route-score">
                  <span>
                    Final routing score
                  </span>

                  <strong>
                    {
                      routingResult
                        .score
                    }
                  </strong>
                </div>

                <div className="route-score">
                  <span>
                    Network latency
                  </span>

                  <strong>
                    {routingResult
                      .node
                      .latencyMs === null
                      ? "Unknown"
                      : `${routingResult.node.latencyMs} ms`}
                  </strong>
                </div>

                <p className="route-reason">
                  {
                    routingResult
                      .reason
                  }
                </p>

                {routingResult
                  .historicalReason ? (
                  <div className="route-score">
                    <span>
                      Historical evidence
                    </span>

                    <strong>
                      {
                        routingResult
                          .historicalReason
                      }
                    </strong>
                  </div>
                ) : (
                  <p className="routing-placeholder">
                    Cold start: no previous{" "}
                    {workloadType} executions
                    for this node yet.
                  </p>
                )}

                {remoteExecutionStatus ===
                  "running" && (
                  <p className="routing-placeholder">
                    Executing{" "}
                    {workloadType} workload
                    on selected node...
                  </p>
                )}

                {remoteExecutionStatus ===
                  "success" &&
                  remoteExecutionResult && (
                    <div className="route-score">
                      <span>
                        Execution result
                      </span>

                      <strong>
                        {
                          remoteExecutionResult
                        }
                      </strong>
                    </div>
                  )}

                {remoteExecutionStatus ===
                  "error" &&
                  remoteExecutionResult && (
                    <p className="room-error">
                      {
                        remoteExecutionResult
                      }
                    </p>
                  )}
              </>
            ) : (
              <p className="routing-placeholder">
                {routingMessage ??
                  "Choose what the task needs, then get a recommendation based on device speed, availability, and connection quality."}
              </p>
            )}
          </article>
        </div>
      </section>


      <section className="routing-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              EXECUTION TELEMETRY
            </p>

            <h3>
              Recent mesh executions
            </h3>
          </div>

          <span className="node-count">
            {executionHistory.length} runs
          </span>
        </div>


        {executionHistory.length ===
        0 ? (
          <article className="waiting-card">
            <h4>
              No telemetry yet
            </h4>

            <p>
              Route a workload to generate the first execution record.
            </p>
          </article>
        ) : (
          <div className="device-grid">
            {executionHistory
              .slice(
                0,
                8
              )
              .map(
                (entry) => (
                  <article
                    className="device-card"
                    key={
                      entry.id
                    }
                  >
                    <div className="device-header">
                      <div>
                        <span className="device-label">
                          {entry.workloadType.toUpperCase()}
                        </span>

                        <h4>
                          {
                            entry.nodeName
                          }
                        </h4>
                      </div>

                      <span className="ready-badge">
                        {entry.success
                          ? "Success"
                          : "Failed"}
                      </span>
                    </div>

                    <div className="metrics">
                      <div className="metric">
                        <span>
                          Location
                        </span>

                        <strong>
                          {
                            entry.executionLocation
                          }
                        </strong>
                      </div>

                      <div className="metric">
                        <span>
                          Complexity
                        </span>

                        <strong>
                          {
                            entry.complexity
                          }
                        </strong>
                      </div>

                      <div className="metric">
                        <span>
                          Route score
                        </span>

                        <strong>
                          {
                            entry.routingScore
                          }
                        </strong>
                      </div>

                      <div className="metric">
                        <span>
                          Network
                        </span>

                        <strong>
                          {entry.networkLatencyMs ===
                          null
                            ? "Unknown"
                            : `${entry.networkLatencyMs} ms`}
                        </strong>
                      </div>

                      <div className="metric">
                        <span>
                          Execution
                        </span>

                        <strong>
                          {
                            entry.executionMs
                          }{" "}
                          ms
                        </strong>
                      </div>

                      <div className="metric">
                        <span>
                          Total
                        </span>

                        <strong>
                          {
                            entry.totalLatencyMs
                          }{" "}
                          ms
                        </strong>
                      </div>
                    </div>
                  </article>
                )
              )}
          </div>
        )}
      </section>
    </main>
  );
}


export default App;
