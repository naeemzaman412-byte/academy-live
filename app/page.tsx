"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

type Tab = "student" | "host-new" | "host-rejoin";

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomFromLink = searchParams.get("room") ?? "";

  const [tab, setTab] = useState<Tab>(() => (roomFromLink ? "student" : "host-new"));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // student fields
  const [studentName, setStudentName] = useState("");
  const [roomName, setRoomName] = useState(() => roomFromLink);

  // host-new fields
  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [roomPassword, setRoomPassword] = useState("");

  // host-rejoin fields
  const [rejoinRoomName, setRejoinRoomName] = useState("");
  const [rejoinTeacherName, setRejoinTeacherName] = useState("");
  const [rejoinPassword, setRejoinPassword] = useState("");

  function goToRoom(room: string, info: object) {
    sessionStorage.setItem(`academy-live:${room}`, JSON.stringify(info));
    router.push(`/room/${encodeURIComponent(room)}`);
  }

  async function handleStudentJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentName.trim() || !roomName.trim()) {
      setError("আপনার নাম এবং ক্লাসের নাম/লিংক দিন।");
      return;
    }
    goToRoom(roomName.trim(), { name: studentName.trim(), role: "student" });
  }

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!teacherName.trim() || !teacherEmail.trim() || !roomPassword.trim()) {
      setError("নাম, ইমেইল এবং রুম পাসওয়ার্ড দিন।");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherName: teacherName.trim(),
          teacherEmail: teacherEmail.trim(),
          roomPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ক্লাস তৈরি করা যায়নি");
      goToRoom(data.roomName, {
        name: teacherName.trim(),
        role: "host",
        token: data.token,
        roomPassword,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRejoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rejoinRoomName.trim() || !rejoinTeacherName.trim() || !rejoinPassword.trim()) {
      setError("রুমের নাম, নাম এবং পাসওয়ার্ড দিন।");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/room/host-rejoin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: rejoinRoomName.trim(),
          teacherName: rejoinTeacherName.trim(),
          roomPassword: rejoinPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "যুক্ত হওয়া যায়নি");
      goToRoom(data.roomName, {
        name: rejoinTeacherName.trim(),
        role: "host",
        token: data.token,
        roomPassword: rejoinPassword,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Academy Live</h1>
        <p className="mt-1 text-sm text-zinc-400">
          আপনার একাডেমীর অনলাইন ক্লাসে জয়েন করুন বা নতুন ক্লাস শুরু করুন।
        </p>

        <div className="mt-6 flex gap-1.5 rounded-lg bg-zinc-950 p-1 text-xs">
          <TabButton active={tab === "student"} onClick={() => setTab("student")}>
            স্টুডেন্ট
          </TabButton>
          <TabButton active={tab === "host-new"} onClick={() => setTab("host-new")}>
            নতুন ক্লাস শুরু করুন
          </TabButton>
          <TabButton active={tab === "host-rejoin"} onClick={() => setTab("host-rejoin")}>
            আগের ক্লাসে ফিরুন
          </TabButton>
        </div>

        {tab === "student" && (
          <form onSubmit={handleStudentJoin} className="mt-6 flex flex-col gap-4">
            <Field label="আপনার নাম">
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="যেমন: রহিম উদ্দিন"
                className={inputCls}
              />
            </Field>
            <Field label="ক্লাসের নাম / লিংক থেকে পাওয়া রুম আইডি">
              <input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="শিক্ষকের দেওয়া লিংক থেকে অটো-পূরণ হবে"
                className={inputCls}
              />
            </Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button disabled={loading} className={btnPrimary}>
              {loading ? "যুক্ত হচ্ছে..." : "ক্লাসে জয়েন করুন"}
            </button>
          </form>
        )}

        {tab === "host-new" && (
          <form onSubmit={handleCreateClass} className="mt-6 flex flex-col gap-4">
            <Field label="আপনার নাম">
              <input
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="যেমন: রহিম উদ্দিন"
                className={inputCls}
              />
            </Field>
            <Field label="আপনার ইমেইল">
              <input
                type="email"
                value={teacherEmail}
                onChange={(e) => setTeacherEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputCls}
              />
            </Field>
            <Field label="একটি রুম পাসওয়ার্ড দিন (পরে এই ক্লাসে হোস্ট হিসেবে আবার ঢুকতে লাগবে)">
              <input
                type="password"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                placeholder="••••••"
                className={inputCls}
              />
            </Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button disabled={loading} className={btnPrimary}>
              {loading ? "তৈরি হচ্ছে..." : "ক্লাস শুরু করুন"}
            </button>
          </form>
        )}

        {tab === "host-rejoin" && (
          <form onSubmit={handleRejoin} className="mt-6 flex flex-col gap-4">
            <Field label="ক্লাসের রুম আইডি">
              <input
                value={rejoinRoomName}
                onChange={(e) => setRejoinRoomName(e.target.value)}
                placeholder="ক্লাস শুরু করার সময় যেটা পেয়েছিলেন"
                className={inputCls}
              />
            </Field>
            <Field label="আপনার নাম">
              <input
                value={rejoinTeacherName}
                onChange={(e) => setRejoinTeacherName(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="রুম পাসওয়ার্ড">
              <input
                type="password"
                value={rejoinPassword}
                onChange={(e) => setRejoinPassword(e.target.value)}
                className={inputCls}
              />
            </Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button disabled={loading} className={btnPrimary}>
              {loading ? "যুক্ত হচ্ছে..." : "হোস্ট হিসেবে ফিরে যান"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500";
const btnPrimary =
  "mt-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm text-zinc-300">{label}</label>
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-2 py-1.5 font-medium transition ${
        active ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
