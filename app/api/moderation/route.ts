import { NextRequest, NextResponse } from "next/server";
import { getRoomServiceClient } from "@/lib/roomAuth";

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

    const svc = getRoomServiceClient(roomName);

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
