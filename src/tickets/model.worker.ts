import { pipeline, env } from "@huggingface/transformers";
import type { ProgressInfo } from "@huggingface/transformers";
env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
let classifier: ReturnType<typeof createClassifier> | null = null;
let runtime = "WebAssembly";
async function createClassifier() {
  const options = {
    dtype: "q8" as const,
    progress_callback: (event: ProgressInfo) =>
      self.postMessage({
        type: "progress",
        message:
          "progress" in event && typeof event.progress === "number"
            ? `Downloading private AI model: ${Math.round(event.progress)}%`
            : "Preparing private AI model…",
      }),
  };
  if ("gpu" in navigator) {
    try {
      runtime = "WebGPU";
      return await pipeline(
        "zero-shot-classification",
        "Xenova/mobilebert-uncased-mnli",
        { ...options, device: "webgpu" },
      );
    } catch {
      runtime = "WebAssembly";
      self.postMessage({ type: "progress", message: "Using the compatible browser AI engine…" });
    }
  }
  return pipeline(
    "zero-shot-classification",
    "Xenova/mobilebert-uncased-mnli",
    {
      ...options,
      device: "wasm",
    },
  );
}
self.onmessage = async (event: MessageEvent<{ text: string }>) => {
  try {
    const started = performance.now();
    classifier ??= createClassifier();
    const model = await classifier;
    self.postMessage({
      type: "progress",
      message: `Analyzing privately with ${runtime}…`,
    });
    const inferenceStart = performance.now();
    const result = await model(
      event.data.text,
      [
        "billing and payments",
        "account access",
        "technical issue",
        "product question",
      ],
      { multi_label: false },
    );
    self.postMessage({
      type: "result",
      result,
      inferenceMs: performance.now() - inferenceStart,
      totalMs: performance.now() - started,
      runtime,
    });
  } catch (error) {
    classifier = null;
    self.postMessage({
      type: "error",
      message:
        error instanceof Error ? error.message : "Model execution failed.",
    });
  }
};
