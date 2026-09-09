import type {
  WorkloadComplexity,
  WorkloadType,
} from "../routing/types";

export type ExecutionTelemetry = {
  id: string;

  workloadId: string;

  workloadType: WorkloadType;

  complexity: WorkloadComplexity;

  nodeId: string;

  nodeName: string;

  executionLocation:
    | "local"
    | "remote";

  routingScore: number;

  networkLatencyMs: number | null;

  executionMs: number;

  totalLatencyMs: number;

  success: boolean;

  timestamp: string;
};