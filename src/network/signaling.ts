import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";
import type { WebRTCSignal } from "./messages";

export type NodePresence = {
  nodeId: string;
  name: string;

  deviceType: string;
  platform: string;
  browser: string;

  cpuCores: number | null;
  memoryGB: number | null;
  webGPU: boolean;

  computeScore: number | null;
  activeTasks: number;

  onlineAt: string;
};

export type ComputeRoomConnection = {
  channel: RealtimeChannel;

  updatePresence: (
    presence: NodePresence
  ) => Promise<void>;

  sendSignal: (
    signal: WebRTCSignal
  ) => Promise<void>;

  leave: () => Promise<void>;
};

type PresenceCallback = (
  nodes: NodePresence[]
) => void;

type SignalCallback = (
  signal: WebRTCSignal
) => void | Promise<void>;

function extractNodes(
  state: Record<string, unknown[]>
): NodePresence[] {
  const nodes: NodePresence[] = [];

  for (const presences of Object.values(state)) {
    for (const presence of presences) {
      const candidate =
        presence as Partial<NodePresence>;

      if (!candidate.nodeId) {
        continue;
      }

      nodes.push(
        candidate as NodePresence
      );
    }
  }

  return nodes;
}

export async function joinComputeRoom(
  roomCode: string,
  presence: NodePresence,
  onPresenceChange: PresenceCallback,
  onSignal: SignalCallback
): Promise<ComputeRoomConnection> {
  const topic =
    `compute-room:${roomCode.toUpperCase()}`;

  const channel = supabase.channel(
    topic,
    {
      config: {
        presence: {
          key: presence.nodeId,
        },
      },
    }
  );

  channel.on(
    "presence",
    {
      event: "sync",
    },
    () => {
      const state =
        channel.presenceState();

      const nodes = extractNodes(
        state as Record<
          string,
          unknown[]
        >
      );

      onPresenceChange(nodes);
    }
  );

  channel.on(
    "broadcast",
    {
      event: "webrtc-signal",
    },
    ({ payload }) => {
      const signal =
        payload as WebRTCSignal;

      if (
        signal.to !==
        presence.nodeId
      ) {
        return;
      }

      void onSignal(signal);
    }
  );

  await new Promise<void>(
    (resolve, reject) => {
      channel.subscribe(
        async (status, error) => {
          if (status === "SUBSCRIBED") {
            const result =
              await channel.track(
                presence
              );

            if (result !== "ok") {
              reject(
                new Error(
                  "Unable to track node presence."
                )
              );

              return;
            }

            resolve();
          }

          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            reject(
              error ??
                new Error(
                  `Realtime connection failed: ${status}`
                )
            );
          }
        }
      );
    }
  );

  return {
    channel,

    updatePresence: async (
      nextPresence
    ) => {
      const result =
        await channel.track(
          nextPresence
        );

      if (result !== "ok") {
        throw new Error(
          "Unable to update node presence."
        );
      }
    },

    sendSignal: async (
      signal
    ) => {
      const result =
        await channel.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: signal,
        });

      if (result !== "ok") {
        throw new Error(
          "Unable to send WebRTC signal."
        );
      }
    },

    leave: async () => {
      await channel.untrack();

      await supabase.removeChannel(
        channel
      );
    },
  };
}