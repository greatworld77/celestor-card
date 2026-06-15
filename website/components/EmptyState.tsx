type EmptyStateProps = {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

export default function EmptyState({
  title,
  message,
  actionHref,
  actionLabel,
}: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-black/30 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-2xl">
        ✦
      </div>

      <h3 className="text-xl font-black text-white">{title}</h3>

      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
        {message}
      </p>

      {actionHref && actionLabel && (
        <a
          href={actionHref}
          className="mt-5 inline-flex rounded-full bg-yellow-300 px-5 py-3 font-black text-black"
        >
          {actionLabel}
        </a>
      )}
    </div>
  );
}