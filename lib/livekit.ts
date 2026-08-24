import { AccessToken } from "livekit-server-sdk";

export type ParticipantRole = "host" | "student";

/**
 * Creates a signed LiveKit access token for a participant joining a room.
 * Hosts get publish/subscribe + room-admin style grants (mute others, etc via server APIs).
 * Students get publish/subscribe grants only (they can share camera/mic/screen and see others).
 */
export async function createAccessToken(opts: {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  role: ParticipantRole;
}) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error(
      "LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not set. Copy .env.local.example to .env.local and fill them in."
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.participantIdentity,
    name: opts.participantName,
    // Session TTL — generous, to comfortably cover long 3+ hour classes.
    ttl: "6h",
  });

  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // Only hosts (teachers) can update room / remove or mute other participants
    // via server-side moderation endpoints; this flag lets the LiveKit dashboard /
    // admin APIs recognize them and is also checked by our own API routes.
    roomAdmin: opts.role === "host",
    roomRecord: opts.role === "host",
  });

  return await at.toJwt();
}
