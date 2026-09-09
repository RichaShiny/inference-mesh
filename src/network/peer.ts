import type {
  PeerMessage,
  WebRTCSignal,
} from "./messages";

type PeerCallbacks = {
  onSignal: (
    signal: WebRTCSignal
  ) => void | Promise<void>;

  onMessage: (
    message: PeerMessage
  ) => void;

  onOpen?: () => void;
  onClose?: () => void;
};

const rtcConfig: RTCConfiguration = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

export class PeerConnection {
  private connection: RTCPeerConnection;

  private dataChannel:
    | RTCDataChannel
    | null = null;

  private pendingIceCandidates:
    RTCIceCandidateInit[] = [];

  private localNodeId: string;
  private remoteNodeId: string;
  private callbacks: PeerCallbacks;

  constructor(
    localNodeId: string,
    remoteNodeId: string,
    callbacks: PeerCallbacks
  ) {
    this.localNodeId = localNodeId;
    this.remoteNodeId = remoteNodeId;
    this.callbacks = callbacks;

    this.connection =
      new RTCPeerConnection(
        rtcConfig
      );

    this.connection.onicecandidate =
      (event) => {
        if (!event.candidate) {
          return;
        }

        void this.callbacks.onSignal({
          type: "ice-candidate",
          from: this.localNodeId,
          to: this.remoteNodeId,
          candidate:
            event.candidate.toJSON(),
        });
      };

    this.connection.ondatachannel =
      (event) => {
        this.attachDataChannel(
          event.channel
        );
      };
  }
  
  async start(): Promise<void> {
    const channel =
      this.connection.createDataChannel(
        "inferencemesh"
      );

    this.attachDataChannel(channel);

    const offer =
      await this.connection.createOffer();

    await this.connection.setLocalDescription(
      offer
    );

    await this.callbacks.onSignal({
      type: "offer",
      from: this.localNodeId,
      to: this.remoteNodeId,
      sdp: offer,
    });
  }

  async handleSignal(
    signal: WebRTCSignal
  ): Promise<void> {
    if (signal.to !== this.localNodeId) {
      return;
    }

    if (
      signal.from !==
      this.remoteNodeId
    ) {
      return;
    }

    if (signal.type === "offer") {
      await this.handleOffer(
        signal.sdp
      );

      return;
    }

    if (signal.type === "answer") {
      await this.connection.setRemoteDescription(
        signal.sdp
      );

      await this.flushIceCandidates();

      return;
    }

    await this.handleIceCandidate(
      signal.candidate
    );
  }

  send(
    message: PeerMessage
  ): boolean {
    if (
      !this.dataChannel ||
      this.dataChannel.readyState !==
        "open"
    ) {
      return false;
    }

    this.dataChannel.send(
      JSON.stringify(message)
    );

    return true;
  }

  close(): void {
    this.dataChannel?.close();
    this.connection.close();
  }

  private async handleOffer(
    offer: RTCSessionDescriptionInit
  ): Promise<void> {
    await this.connection.setRemoteDescription(
      offer
    );

    await this.flushIceCandidates();

    const answer =
      await this.connection.createAnswer();

    await this.connection.setLocalDescription(
      answer
    );

    await this.callbacks.onSignal({
      type: "answer",
      from: this.localNodeId,
      to: this.remoteNodeId,
      sdp: answer,
    });
  }

  private async handleIceCandidate(
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    if (
      !this.connection.remoteDescription
    ) {
      this.pendingIceCandidates.push(
        candidate
      );

      return;
    }

    await this.connection.addIceCandidate(
      candidate
    );
  }

  private async flushIceCandidates():
  Promise<void> {
    for (
      const candidate
      of this.pendingIceCandidates
    ) {
      await this.connection.addIceCandidate(
        candidate
      );
    }

    this.pendingIceCandidates = [];
  }

  private attachDataChannel(
    channel: RTCDataChannel
  ): void {
    this.dataChannel = channel;

    channel.onopen = () => {
      this.callbacks.onOpen?.();
    };

    channel.onclose = () => {
      this.callbacks.onClose?.();
    };

    channel.onmessage = (event) => {
      try {
        const message =
          JSON.parse(
            event.data as string
          ) as PeerMessage;

        this.callbacks.onMessage(
          message
        );
      } catch {
        console.error(
          "Received invalid peer message."
        );
      }
    };
  }
}