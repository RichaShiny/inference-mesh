import type {
  RemoteWorkloadPayload,
  RemoteWorkloadResult,
} from "../network/messages";


export function executeRemoteWorkload(
  payload: RemoteWorkloadPayload
): RemoteWorkloadResult {
  if (
    payload.operation === "square"
  ) {
    return (
      payload.value *
      payload.value
    );
  }

  if (
    payload.operation === "uppercase"
  ) {
    return payload.value.toUpperCase();
  }

  if (
    payload.operation === "word-count"
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