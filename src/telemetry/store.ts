import type {
  ExecutionTelemetry,
} from "./types";

const MAX_HISTORY = 100;

let executionHistory:
  ExecutionTelemetry[] = [];

export function recordExecution(
  telemetry: ExecutionTelemetry
): void {
  executionHistory = [
    telemetry,
    ...executionHistory,
  ].slice(
    0,
    MAX_HISTORY
  );
}

export function getExecutionHistory():
ExecutionTelemetry[] {
  return [
    ...executionHistory,
  ];
}

export function getNodeHistory(
  nodeId: string
): ExecutionTelemetry[] {
  return executionHistory.filter(
    (entry) =>
      entry.nodeId === nodeId
  );
}

export function clearExecutionHistory():
void {
  executionHistory = [];
}