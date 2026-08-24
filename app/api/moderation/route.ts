import { NextRequest, NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

// NOTE (MVP security note — see README "Production hardening"):
// This route trusts that only the host UI calls it. For real deployments,
// verify the caller's LiveKit token/identity server-side (e.g. by having the
// client send its own JWT and checking the `roomAdmin` grant) before allowing
// moderation actions.
export async function POST(req: NextRequest) {
  try {
    const { action, roomName, participantIdentity } = (await req.json()) as {
      action: "mute" | "remove";
      roomName?: string;
      participantIdentity?: string;
    };

    if (!action || !roomName || !participantIdentity) {
      return NextResponse.json(
        { error: "action, roomName and participantIdentity are required" },
        { status: 400 }
      );
    }

    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!livekitUrl || !apiKey || !apiSecret) {
      throw new Error("LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET must be set");
    }

    const svc = new RoomServiceClient(livekitUrl, apiKey, apiSecret);

    if (action === "remove") {
      await svc.removeParticipant(roomName, participantIdentity);
    } else if (action === "mute") {
      const participant = await svc.getParticipant(roomName, participantIdentity);
      for (const track of participant.tracks) {
        if (track.type === 0 /* AUDIO */) {
          await svc.mutePublishedTrack(roomName, participantIdentity, track.sid, true);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
