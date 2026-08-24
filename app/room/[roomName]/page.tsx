import ClassRoom from "@/components/ClassRoom";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomName: string }>;
}) {
  const { roomName } = await params;
  return <ClassRoom roomName={decodeURIComponent(roomName)} />;
}
