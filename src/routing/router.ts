import type {
  ComputeNode,
  RoutingResult,
  Workload,
} from "./types";

function normalizeLatency(
  latencyMs: number | null
): number {
  if (latencyMs === null) {
    return 0.5;
  }

  return Math.max(
    0,
    Math.min(
      1,
      1 - latencyMs / 500
    )
  );
}

function workloadComputeWeight(
  workload: Workload
): number {
  if (workload.complexity === "high") {
    return 0.55;
  }

  if (workload.complexity === "medium") {
    return 0.45;
  }

  return 0.35;
}

function scoreNode(
  node: ComputeNode,
  workload: Workload
): number {
  if (!node.online) {
    return -1;
  }

  if (
    workload.requiresWebGPU &&
    !node.webGPU
  ) {
    return -1;
  }

  if (node.computeScore === null) {
    return -1;
  }

  const compute =
    node.computeScore / 100;

  const latency =
    normalizeLatency(node.latencyMs);

  const load =
    Math.max(
      0,
      1 - node.activeTasks / 5
    );

  const gpuBonus =
    node.webGPU ? 1 : 0;

  const computeWeight =
    workloadComputeWeight(workload);

  const score =
    compute * computeWeight +
    latency * 0.20 +
    load * 0.15 +
    gpuBonus * 0.10;

  return Math.round(
    score * 1000
  ) / 1000;
}

export function routeWorkload(
  workload: Workload,
  nodes: ComputeNode[]
): RoutingResult | null {
  const scored = nodes
    .map((node) => ({
      node,
      score: scoreNode(
        node,
        workload
      ),
    }))
    .filter(
      (candidate) =>
        candidate.score >= 0
    )
    .sort(
      (a, b) =>
        b.score - a.score
    );

  const winner = scored[0];

  if (!winner) {
    return null;
  }

  const reason =
    `${winner.node.name} had the highest ` +
    `routing score for this ` +
    `${workload.complexity} complexity ` +
    `${workload.type} workload based on ` +
    `compute performance, latency, ` +
    `current load, and WebGPU support.`;

  return {
    node: winner.node,
    score: winner.score,
    reason,
  };
}