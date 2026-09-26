export default function Loading() {
    return (
        <div
            className="min-h-dvh app-bg"
            role="status"
            aria-live="polite"
            aria-label="Loading page"
        >
            <div className="max-w-2xl mx-auto px-4 py-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-full skeleton-shimmer shrink-0" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3.5 w-32 skeleton-shimmer rounded" />
                        <div className="h-3 w-20 skeleton-shimmer rounded" />
                    </div>
                </div>
                <div className="space-y-5">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="rounded-2xl border border-[var(--border-subtle)] bg-white dark:bg-gray-900 p-4"
                        >
                            <div className="space-y-2.5">
                                <div className="h-3 w-1/3 skeleton-shimmer rounded" />
                                <div className="h-3 w-full skeleton-shimmer rounded" />
                                <div className="h-3 w-2/3 skeleton-shimmer rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
