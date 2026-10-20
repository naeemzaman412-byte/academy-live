/**
 * Several LiveKit projects (one per teacher) behind a single app.
 *
 * Room names created for "শিক্ষক 2" start with "t2-". Everything on the server that talks to
 * LiveKit (tokens, room service, moderation) looks at that prefix and uses the matching
 * LIVEKIT_URL_2 / LIVEKIT_API_KEY_2 / LIVEKIT_API_SECRET_2 variables. Rooms without a prefix
 * (old links) keep using the plain LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET.
 */
export type LiveKitCreds = { url: string; apiKey: string; apiSecret: string; teacher: number | null };

export const MAX_TEACHERS = 5;

export function teacherFromRoom(roomName: string): number | null {
  const m = /^t([1-9])-/.exec(roomName);
  return m ? Number(m[1]) : null;
}

export function getCreds(roomOrTeacher: string | number | null): LiveKitCreds {
  const teacher = typeof roomOrTeacher === "number" ? roomOrTeacher : roomOrTeacher ? teacherFromRoom(roomOrTeacher) : null;
  const sfx = teacher ? `_${teacher}` : "";
  const url = (process.env[`LIVEKIT_URL${sfx}`] ?? "").trim();
  const apiKey = (process.env[`LIVEKIT_API_KEY${sfx}`] ?? "").trim();
  const apiSecret = (process.env[`LIVEKIT_API_SECRET${sfx}`] ?? "").trim();
  if (!url || !apiKey || !apiSecret) {
    throw new Error(
      teacher
        ? `শিক্ষক ${teacher}-এর LiveKit তথ্য (LIVEKIT_URL_${teacher}, LIVEKIT_API_KEY_${teacher}, LIVEKIT_API_SECRET_${teacher}) সেট করা নেই`
        : "LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET সেট করা নেই"
    );
  }
  return { url, apiKey, apiSecret, teacher };
}
