export type WebRTCSignal =
  | {
      type: "offer";
      from: string;
      to: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "answer";
      from: string;
      to: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "ice-candidate";
      from: string;
      to: string;
      candidate: RTCIceCandidateInit;
    };

export type PeerMessage =
  | {
      type: "ping";
      timestamp: number;
    }
  | {
      type: "pong";
      timestamp: number;
    }
  | {
      type: "workload";
      workloadId: string;
      payload: unknown;
    }
  | {
      type: "result";
      workloadId: string;
      payload: unknown;
    };