export type DeviceCapabilities = {
  cpuCores: number | null;
  memoryGB: number | null;
  webGPU: "Supported" | "Unavailable" | "Checking";
  browser: string;
  platform: string;
  deviceType: string;
};

function detectBrowser(): string {
  const userAgent = navigator.userAgent;

  if (userAgent.includes("Edg/")) return "Edge";

  if (
    userAgent.includes("Chrome/") &&
    !userAgent.includes("Edg/")
  ) {
    return "Chrome";
  }

  if (
    userAgent.includes("Safari/") &&
    !userAgent.includes("Chrome/")
  ) {
    return "Safari";
  }

  if (userAgent.includes("Firefox/")) {
    return "Firefox";
  }

  return "Unknown";
}

function detectPlatform(): string {
  const userAgent = navigator.userAgent;

  if (userAgent.includes("iPhone")) return "iOS";
  if (userAgent.includes("iPad")) return "iPadOS";
  if (userAgent.includes("Mac OS")) return "macOS";
  if (userAgent.includes("Android")) return "Android";
  if (userAgent.includes("Windows")) return "Windows";
  if (userAgent.includes("Linux")) return "Linux";

  return "Unknown";
}

function detectDeviceType(): string {
  const userAgent = navigator.userAgent;

  if (/iPhone|Android.+Mobile/i.test(userAgent)) {
    return "Phone";
  }

  if (/iPad|Tablet|Android/i.test(userAgent)) {
    return "Tablet";
  }

  return "Computer";
}

async function detectWebGPU(): Promise<
  "Supported" | "Unavailable"
> {
  const gpu = (
    navigator as Navigator & {
      gpu?: {
        requestAdapter: () => Promise<unknown | null>;
      };
    }
  ).gpu;

  if (!gpu) {
    return "Unavailable";
  }

  try {
    const adapter = await gpu.requestAdapter();

    return adapter ? "Supported" : "Unavailable";
  } catch {
    return "Unavailable";
  }
}

export async function detectDeviceCapabilities():
Promise<DeviceCapabilities> {
  const navigatorWithMemory = navigator as Navigator & {
    deviceMemory?: number;
  };

  return {
    cpuCores: navigator.hardwareConcurrency || null,
    memoryGB: navigatorWithMemory.deviceMemory ?? null,
    webGPU: await detectWebGPU(),
    browser: detectBrowser(),
    platform: detectPlatform(),
    deviceType: detectDeviceType(),
  };
}