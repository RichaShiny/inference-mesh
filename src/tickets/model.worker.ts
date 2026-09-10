import { pipeline, env } from "@huggingface/transformers";
env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
let classifier: ReturnType<typeof createClassifier> | null = null;
function createClassifier() {
  return pipeline(
    "zero-shot-classification",
    "Xenova/mobilebert-uncased-mnli",
    {
      device: "wasm",
      dtype: "q8",
      progress_callback: (event) =>
        self.postMessage({
          type: "progress",
          message:
            "progress" in event
              ? `Downloading model: ${Math.round(event.progress)}%`
              : "Preparing classification model…",
        }),
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
      message: "Classifying ticket on this device…",
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
