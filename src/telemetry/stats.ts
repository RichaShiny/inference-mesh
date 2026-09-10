import type {
  WorkloadType,
} from "../routing/types";

import type {
  ExecutionTelemetry,
} from "./types";

export type NodePerformance = {
  nodeId: string;

  workloadType: WorkloadType;

  totalRuns: number;

  successfulRuns: number;

  successRate: number;

  averageExecutionMs: number;

  averageTotalLatencyMs: number;
};


function average(
  values: number[]
): number {
  if (values.length === 0) {
    return 0;
  }

  const total =
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  return total / values.length;
}


export function getNodePerformance(
  history: ExecutionTelemetry[],
  nodeId: string,
  workloadType: WorkloadType
): NodePerformance | null {
  const matchingRuns =
    history.filter(
      (entry) =>
        entry.nodeId === nodeId &&
        entry.workloadType ===
          workloadType
    );

  if (
    matchingRuns.length === 0
  ) {
    return null;
  }

  const successfulRuns =
    matchingRuns.filter(
      (entry) =>
        entry.success
    );

  const successRate =
    successfulRuns.length /
    matchingRuns.length;

  const averageExecutionMs =
    average(
      successfulRuns.map(
        (entry) =>
          entry.executionMs
      )
    );

  const averageTotalLatencyMs =
    average(
      successfulRuns.map(
        (entry) =>
          entry.totalLatencyMs
      )
    );

  return {
    nodeId,

    workloadType,

    totalRuns:
      matchingRuns.length,

    successfulRuns:
      successfulRuns.length,

    successRate,

    averageExecutionMs,

    averageTotalLatencyMs,
  };
}