import { NextRequest, NextResponse } from "next/server";
import { createAccessToken } from "@/lib/livekit";
import { getRoomServiceClient } from "@/lib/roomAuth";

// Student join only. Hosts get their tokens from /api/room/create (new
// class) or /api/room/host-rejoin (reclaiming an existing class) — those
// routes are the ones that actually verify a teacher's room password.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomName, participantName } = body as {
      roomName?: string;
      participantName?: string;
    };

    if (!roomName?.trim() || !participantName?.trim()) {
      return NextResponse.json(
        { error: "roomName এবং participantName আবশ্যক" },
        { status: 400 }
      );
    }

    const svc = getRoomServiceClient();
    const existing = await svc.listRooms([roomName]);
    if (existing.length === 0) {
      return NextResponse.json(
        { error: "এই নামে কোনো ক্লাস খোলা নেই — লিংকটি আবার চেক করুন বা শিক্ষকের কাছে জিজ্ঞাসা করুন" },
        { status: 404 }
      );
    }

    const participantIdentity = `student-${participantName}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const token = await createAccessToken({
      roomName,
      participantName,
      participantIdentity,
      role: "student",
    });

    return NextResponse.json({ token });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
