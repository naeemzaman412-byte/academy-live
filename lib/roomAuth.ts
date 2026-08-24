import crypto from "crypto";
import { RoomServiceClient } from "livekit-server-sdk";

export type RoomMetadata = {
  passwordHash: string;
  teacherName: string;
  teacherEmail: string;
  createdAt: number;
};

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Copy .env.local.example to .env.local.`);
  return v;
}

export function getRoomServiceClient() {
  return new RoomServiceClient(
    getEnv("LIVEKIT_URL"),
    getEnv("LIVEKIT_API_KEY"),
    getEnv("LIVEKIT_API_SECRET")
  );
}

/**
 * A room password is hashed with a server-side pepper so the raw password
 * never needs to be stored anywhere — the hash lives in the LiveKit room's
 * `metadata` field, which acts as our lightweight "database" (no separate
 * DB needed). Anyone who knows the room name AND the original password can
 * reclaim the host role for that room later (e.g. reconnecting, or from a
 * different device).
 */
export function hashRoomPassword(roomName: string, password: string): string {
  const pepper = process.env.LIVEKIT_API_SECRET || "academy-live";
  return crypto
    .createHmac("sha256", pepper)
    .update(`${roomName}::${password}`)
    .digest("hex");
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

function randomSuffix(len = 5) {
  return crypto.randomBytes(8).toString("base64url").toLowerCase().slice(0, len);
}

/** Generates a room name that doesn't currently exist on the LiveKit server. */
export async function generateUniqueRoomName(
  svc: RoomServiceClient,
  teacherName: string
) {
  const base = slugify(teacherName) || "class";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${base}-${randomSuffix()}`;
    const existing = await svc.listRooms([candidate]);
    if (existing.length === 0) return candidate;
  }
  // Extremely unlikely fallback: timestamp guarantees uniqueness.
  return `${base}-${Date.now().toString(36)}`;
}

export async function getRoomMetadata(
  svc: RoomServiceClient,
  roomName: string
): Promise<RoomMetadata | null> {
  const rooms = await svc.listRooms([roomName]);
  const room = rooms[0];
  if (!room || !room.metadata) return null;
  try {
    return JSON.parse(room.metadata) as RoomMetadata;
  } catch {
    return null;
  }
}
