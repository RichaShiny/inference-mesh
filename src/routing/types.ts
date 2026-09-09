export type WorkloadType =
  | "classification"
  | "embedding"
  | "summarization"
  | "reasoning";

export type WorkloadComplexity =
  | "low"
  | "medium"
  | "high";

export type ComputeNode = {
  id: string;
  name: string;
  deviceType: string;

  cpuCores: number | null;
  memoryGB: number | null;
  webGPU: boolean;

  computeScore: number | null;
  latencyMs: number | null;
  activeTasks: number;

  online: boolean;
};

export type Workload = {
  id: string;
  type: WorkloadType;
  complexity: WorkloadComplexity;
  requiresWebGPU: boolean;
};

export type RoutingResult = {
  node: ComputeNode;
  score: number;
  reason: string;
};