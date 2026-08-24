import { NextRequest, NextResponse } from "next/server";
import { createAccessToken } from "@/lib/livekit";
import { getRoomServiceClient, getRoomMetadata, hashRoomPassword } from "@/lib/roomAuth";

// Lets a teacher reclaim the host role for a class they already started —
// from a new tab, a reload, or a different device — by proving they know
// the room's password.
export async function POST(req: NextRequest) {
  try {
    const { roomName, teacherName, roomPassword } = (await req.json()) as {
      roomName?: string;
      teacherName?: string;
      roomPassword?: string;
    };

    if (!roomName?.trim() || !teacherName?.trim() || !roomPassword?.trim()) {
      return NextResponse.json(
        { error: "রুমের নাম, আপনার নাম এবং পাসওয়ার্ড আবশ্যক" },
        { status: 400 }
      );
    }

    const svc = getRoomServiceClient();
    const metadata = await getRoomMetadata(svc, roomName);
    if (!metadata) {
      return NextResponse.json(
        { error: "এই নামে কোনো ক্লাস পাওয়া যায়নি — হয়তো ক্লাসটি শেষ হয়ে গেছে" },
        { status: 404 }
      );
    }

    const expectedHash = hashRoomPassword(roomName, roomPassword);
    if (expectedHash !== metadata.passwordHash) {
      return NextResponse.json({ error: "ভুল পাসওয়ার্ড" }, { status: 401 });
    }

    const participantIdentity = `host-${teacherName}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const token = await createAccessToken({
      roomName,
      participantName: teacherName,
      participantIdentity,
      role: "host",
    });

    return NextResponse.json({ roomName, token });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
