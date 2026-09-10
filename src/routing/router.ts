import type {
  ComputeNode,
  RoutingResult,
  Workload,
} from "./types";

import {
  getNodePerformance,
} from "../telemetry/stats";

import type {
  ExecutionTelemetry,
} from "../telemetry/types";


function roundScore(
  value: number
): number {
  return Math.round(
    value * 1000
  ) / 1000;
}


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
  if (
    workload.complexity === "high"
  ) {
    return 0.55;
  }

  if (
    workload.complexity === "medium"
  ) {
    return 0.45;
  }

  return 0.35;
}


function historicalLatencyScore(
  latencyMs: number
): number {
  return Math.max(
    0,
    Math.min(
      1,
      1 - latencyMs / 1000
    )
  );
}


function getHistoricalAdjustment(
  node: ComputeNode,
  workload: Workload,
  history: ExecutionTelemetry[]
): {
  adjustment: number;
  reason: string | null;
} {
  const performance =
    getNodePerformance(
      history,
      node.id,
      workload.type
    );

  if (!performance) {
    return {
      adjustment: 0,
      reason: null,
    };
  }

  const confidence =
    Math.min(
      performance.totalRuns / 5,
      1
    );

  const latencyScore =
    historicalLatencyScore(
      performance.averageTotalLatencyMs
    );

  const historicalQuality =
    performance.successRate *
      0.65 +
    latencyScore *
      0.35;

  const adjustment =
    (
      historicalQuality - 0.5
    ) *
    0.20 *
    confidence;

  const roundedAdjustment =
    roundScore(
      adjustment
    );

  const reason =
    `${performance.totalRuns} prior ` +
    `${workload.type} run${
      performance.totalRuns === 1
        ? ""
        : "s"
    }, ` +
    `${Math.round(
      performance.successRate * 100
    )}% success, ` +
    `${Math.round(
      performance.averageTotalLatencyMs
    )} ms average total latency`;

  return {
    adjustment:
      roundedAdjustment,

    reason,
  };
}


function scoreNode(
  node: ComputeNode,
  workload: Workload,
  history: ExecutionTelemetry[]
): {
  baseScore: number;
  historicalAdjustment: number;
  finalScore: number;
  historicalReason: string | null;
} {
  if (!node.online) {
    return {
      baseScore: -1,
      historicalAdjustment: 0,
      finalScore: -1,
      historicalReason: null,
    };
  }

  if (
    workload.requiresWebGPU &&
    !node.webGPU
  ) {
    return {
      baseScore: -1,
      historicalAdjustment: 0,
      finalScore: -1,
      historicalReason: null,
    };
  }

  if (
    node.computeScore === null
  ) {
    return {
      baseScore: -1,
      historicalAdjustment: 0,
      finalScore: -1,
      historicalReason: null,
    };
  }

  const compute =
    node.computeScore / 100;

  const latency =
    normalizeLatency(
      node.latencyMs
    );

  const load =
    Math.max(
      0,
      1 -
        node.activeTasks / 5
    );

  const gpuBonus =
    workload.requiresWebGPU &&
    node.webGPU
      ? 1
      : 0;

  const computeWeight =
    workloadComputeWeight(
      workload
    );

  const baseScore =
    compute *
      computeWeight +
    latency *
      0.20 +
    load *
      0.15 +
    gpuBonus *
      0.10;

  const historical =
    getHistoricalAdjustment(
      node,
      workload,
      history
    );

  const roundedBaseScore =
    roundScore(
      baseScore
    );

  const finalScore =
    roundScore(
      baseScore +
      historical.adjustment
    );

  return {
    baseScore:
      roundedBaseScore,

    historicalAdjustment:
      historical.adjustment,

    finalScore,

    historicalReason:
      historical.reason,
  };
}


export function routeWorkload(
  workload: Workload,
  nodes: ComputeNode[],
  history: ExecutionTelemetry[] = []
): RoutingResult | null {
  const scored =
    nodes
      .map((node) => {
        const result =
          scoreNode(
            node,
            workload,
            history
          );

        return {
          node,

          baseScore:
            result.baseScore,

          historicalAdjustment:
            result.historicalAdjustment,

          score:
            result.finalScore,

          historicalReason:
            result.historicalReason,
        };
      })
      .filter(
        (candidate) =>
          candidate.score >= 0
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  const winner =
    scored[0];

  if (!winner) {
    return null;
  }

  let reason =
    `${winner.node.name} had the highest ` +
    `routing score for this ` +
    `${workload.complexity} complexity ` +
    `${workload.type} workload based on ` +
    `compute performance, latency, ` +
    `current load, and WebGPU support.`;

  if (
    winner.historicalReason
  ) {
    reason +=
      ` Historical performance also ` +
      `influenced the decision: ` +
      `${winner.historicalReason}.`;
  }

  return {
    node:
      winner.node,

    baseScore:
      winner.baseScore,

    historicalAdjustment:
      winner.historicalAdjustment,

    score:
      winner.score,

    historicalReason:
      winner.historicalReason,

    reason,
  };
}