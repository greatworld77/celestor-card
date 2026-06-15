"use client";

export type AppNoticeData = {
  type: "success" | "error" | "info";
  message: string;
};

type AppNoticeProps = {
  notice: AppNoticeData | null;
  onClose: () => void;
  offset?: "home" | "page";
};

export default function AppNotice({
  notice,
  onClose,
  offset = "page",
}: AppNoticeProps) {
  if (!notice) return null;

  const topClass = offset === "home" ? "top-24" : "top-6";

  const labelColor =
    notice.type === "success"
      ? "text-green-300"
      : notice.type === "error"
      ? "text-red-300"
      : "text-yellow-300";

  return (
    <div
      className={`fixed right-4 ${topClass} z-[80] w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`text-sm font-bold uppercase tracking-[0.25em] ${labelColor}`}
          >
            {notice.type}
          </p>

          <p className="mt-2 text-sm leading-6 text-zinc-200">
            {notice.message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 px-3 py-1 text-sm text-zinc-400 hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}