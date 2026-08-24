import { NextRequest, NextResponse } from "next/server";
import { createAccessToken } from "@/lib/livekit";
import {
  getRoomServiceClient,
  generateUniqueRoomName,
  hashRoomPassword,
  RoomMetadata,
} from "@/lib/roomAuth";

// Open teacher access: no TEACHERS env / shared passcode needed. Any teacher
// can create their own unique classroom on the spot with their own name,
// email and a room password of their choosing.
export async function POST(req: NextRequest) {
  try {
    const { teacherName, teacherEmail, roomPassword } = (await req.json()) as {
      teacherName?: string;
      teacherEmail?: string;
      roomPassword?: string;
    };

    if (!teacherName?.trim() || !teacherEmail?.trim() || !roomPassword?.trim()) {
      return NextResponse.json(
        { error: "নাম, ইমেইল এবং রুম পাসওয়ার্ড আবশ্যক" },
        { status: 400 }
      );
    }

    const svc = getRoomServiceClient();
    const roomName = await generateUniqueRoomName(svc, teacherName);

    const metadata: RoomMetadata = {
      passwordHash: hashRoomPassword(roomName, roomPassword),
      teacherName,
      teacherEmail,
      createdAt: Date.now(),
    };

    await svc.createRoom({
      name: roomName,
      metadata: JSON.stringify(metadata),
      // Keep the room alive for a while even if the teacher briefly
      // disconnects (long classes, flaky connections, tab reloads).
      emptyTimeout: 60 * 60, // 1 hour of nobody connected
      departureTimeout: 30 * 60,
    });

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
