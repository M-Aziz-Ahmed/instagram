"use client";

export default function Skeleton({ className = "", count = 1 }) {
    return (
        <div className={`space-y-3 ${className}`}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="skeleton-shimmer rounded-xl h-4 w-full" />
            ))}
        </div>
    );
}

export function PostSkeleton() {
    return (
        <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
            <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full shrink-0 skeleton-shimmer" />
                <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-24 skeleton-shimmer rounded" />
                        <div className="h-3 w-12 skeleton-shimmer rounded" />
                    </div>
                    <div className="h-4 w-3/4 skeleton-shimmer rounded" />
                    <div className="h-4 w-1/2 skeleton-shimmer rounded" />
                    <div className="h-48 w-full skeleton-shimmer rounded-2xl" />
                    <div className="flex items-center gap-4 pt-1">
                        <div className="h-8 w-16 skeleton-shimmer rounded-lg" />
                        <div className="h-8 w-16 skeleton-shimmer rounded-lg" />
                        <div className="h-8 w-16 skeleton-shimmer rounded-lg" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ProfileSkeleton() {
    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="flex items-start gap-5 mb-6">
                <div className="w-20 h-20 rounded-full skeleton-shimmer shrink-0" />
                <div className="flex-1 space-y-3 pt-1">
                    <div className="h-6 w-40 skeleton-shimmer rounded" />
                    <div className="h-4 w-24 skeleton-shimmer rounded" />
                    <div className="flex gap-6">
                        <div className="h-4 w-20 skeleton-shimmer rounded" />
                        <div className="h-4 w-20 skeleton-shimmer rounded" />
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-1">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="aspect-square skeleton-shimmer rounded-lg" />
                ))}
            </div>
        </div>
    );
}

export function ConversationSkeleton() {
    return (
        <div>
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
                    <div className="w-14 h-14 rounded-full skeleton-shimmer shrink-0" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-24 skeleton-shimmer rounded" />
                        <div className="h-3 w-40 skeleton-shimmer rounded" />
                    </div>
                </div>
            ))}
        </div>
    );
}
