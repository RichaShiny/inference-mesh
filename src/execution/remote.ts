import type {
  RemoteWorkloadPayload,
  RemoteWorkloadResult,
} from "../network/messages";


function classifyText(
  text: string
): string {
  const normalized =
    text.toLowerCase();

  if (
    normalized.includes("refund") ||
    normalized.includes("payment") ||
    normalized.includes("invoice")
  ) {
    return "billing";
  }

  if (
    normalized.includes("error") ||
    normalized.includes("bug") ||
    normalized.includes("broken")
  ) {
    return "technical";
  }

  if (
    normalized.includes("account") ||
    normalized.includes("login") ||
    normalized.includes("password")
  ) {
    return "account";
  }

  return "general";
}


function embedText(
  text: string
): string {
  const dimensions = 8;

  const vector =
    Array.from(
      { length: dimensions },
      () => 0
    );

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const bucket =
      index % dimensions;

    vector[bucket] +=
      text.charCodeAt(index) / 255;
  }

  const formatted =
    vector.map(
      (value) =>
        Number(value.toFixed(3))
    );

  return JSON.stringify(
    formatted
  );
}


function summarizeText(
  text: string
): string {
  const words =
    text
      .trim()
      .split(/\s+/);

  if (words.length <= 12) {
    return text.trim();
  }

  return (
    words
      .slice(0, 12)
      .join(" ") +
    "..."
  );
}


function runReasoning(
  values: number[]
): number {
  return values.reduce(
    (total, value) =>
      total +
      value * value,
    0
  );
}


export function executeRemoteWorkload(
  payload: RemoteWorkloadPayload
): RemoteWorkloadResult {
  if (
    payload.operation ===
    "classification"
  ) {
    return classifyText(
      payload.text
    );
  }

  if (
    payload.operation ===
    "embedding"
  ) {
    return embedText(
      payload.text
    );
  }

  if (
    payload.operation ===
    "summarization"
  ) {
    return summarizeText(
      payload.text
    );
  }

  if (
    payload.operation ===
    "reasoning"
  ) {
    return runReasoning(
      payload.values
    );
  }

  if (
    payload.operation ===
    "square"
  ) {
    return (
      payload.value *
      payload.value
    );
  }

  if (
    payload.operation ===
    "uppercase"
  ) {
    return payload.value.toUpperCase();
  }

  if (
    payload.operation ===
    "word-count"
  ) {
    const trimmed =
      payload.value.trim();

    if (!trimmed) {
      return 0;
    }

    return trimmed
      .split(/\s+/)
      .length;
  }

  const exhaustiveCheck: never =
    payload;

  throw new Error(
    `Unsupported workload: ${exhaustiveCheck}`
  );
}