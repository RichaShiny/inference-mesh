export type BenchmarkResult = {
  durationMs: number;
  operationsPerSecond: number;
  computeScore: number;
};

export async function runCpuBenchmark():
Promise<BenchmarkResult> {
  const iterations = 500_000;

  await new Promise((resolve) =>
    setTimeout(resolve, 50)
  );

  let value = 0.5;

  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    value =
      Math.sin(value + (i % 10))
      * Math.cos(value)
      + Math.sqrt((i % 100) + 1);
  }

  const durationMs =
    performance.now() - start;

  const operationsPerSecond =
    iterations / (durationMs / 1000);

  const computeScore = Math.max(
    1,
    Math.min(
      100,
      Math.round(
        operationsPerSecond / 100_000
      )
    )
  );

  void value;

  return {
    durationMs: Math.round(durationMs),
    operationsPerSecond: Math.round(
      operationsPerSecond
    ),
    computeScore,
  };
}