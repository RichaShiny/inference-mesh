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


export type RemoteWorkloadPayload =
  | {
      operation: "square";
      value: number;
    }
  | {
      operation: "uppercase";
      value: string;
    }
  | {
      operation: "word-count";
      value: string;
    };


export type RemoteWorkloadResult =
  | number
  | string;


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
      payload: RemoteWorkloadPayload;
    }
  | {
      type: "result";
      workloadId: string;
      success: true;
      result: RemoteWorkloadResult;
    }
  | {
      type: "result";
      workloadId: string;
      success: false;
      error: string;
    };