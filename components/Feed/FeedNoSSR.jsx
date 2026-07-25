"use client";

import { useEffect, useState, useCallback, useRef } from "react";

function FeedNoSSR() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const sentinelRef = useRef(null);
    const lastRefreshRef = useRef(0);
    const cacheRef = useRef(new Map());

    const getCacheKey = (params) => {
        const { tag, feed, username, before } = params;
        return `${tag || 'all'}|${feed || 'all'}|${username || 'guest'}|${before || 'start'}`;
    };

    const fetchPosts = useCallback(async ({ append = false, reset = false } = {}) => {
        if (loadingMore) return;
        try {
            setLoadingMore(true);
            
            const params = new URLSearchParams();
            params.set("limit", "30");
            if (append && posts.length > 0) {
                const oldest = posts[posts.length - 1];
                if (oldest?.timeStamp) params.set("before", oldest.timeStamp);
            }
            
            const cacheKey = getCacheKey(Object.fromEntries(params.entries()));
            
            if (cacheRef.current.has(cacheKey) && !reset) {
                const cached = cacheRef.current.get(cacheKey);
                if (cached.timestamp > Date.now() - 60000) {
                    if (append) {
                        setPosts(prev => {
                            const ids = new Set(prev.map(p => p._id));
                            const fresh = cached.data.filter(p => !ids.has(p._id));
                            return [...prev, ...fresh];
                        });
                        setHasMore(cached.hasMore);
                        setLoadingMore(false);
                        return;
                    } else {
                        setPosts(cached.data);
                        setHasMore(cached.hasMore);
                        setLoading(false);
                        setLoadingMore(false);
                        return;
                    }
                }
            }
            
            const url = `/api/posts?${params}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(url, { 
                signal: controller.signal,
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            const newPosts = Array.isArray(data.posts) ? data.posts : [];
            
            if (append) {
                setPosts((prev) => {
                    const ids = new Set(prev.map((p) => p._id));
                    const fresh = newPosts.filter((p) => !ids.has(p._id));
                    return [...prev, ...fresh];
                });
            } else {
                setPosts(newPosts);
            }
            
            setHasMore(data.hasMore || false);
            
            if (!reset) {
                cacheRef.current.set(cacheKey, {
                    data: append ? [...posts, ...newPosts] : newPosts,
                    hasMore: data.hasMore || false,
                    timestamp: Date.now()
                });
            }
            
        } catch (error) {
            console.error('Error fetching posts:', error);
            if (!posts.length) {
                setPosts([]);
            }
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [posts, loadingMore]);

    useEffect(() => {
        cacheRef.current.clear();
        setPosts([]);
        setHasMore(false);
        setLoading(true);
        fetchPosts({ reset: true });
    }, []);

    useEffect(() => {
        const intervalId = setInterval(() => {
            const now = Date.now();
            if (now - lastRefreshRef.current < 30000) return;
            lastRefreshRef.current = now;
            fetchPosts({ reset: true });
        }, 30000);
        
        return () => clearInterval(intervalId);
    }, [fetchPosts]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    fetchPosts({ append: true });
                }
            },
            { 
                rootMargin: "400px",
                threshold: 0.01
            }
        );
        
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, fetchPosts]);

    if (loading) {
        return (
            <div className="flex h-dvh items-center justify-center bg-white dark:bg-gray-950">
                <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-700 border-t-gray-600 dark:border-t-gray-400 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div>
            {posts.map((post) => (
                <div key={post._id} className="border-b p-4 hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                            {post.sender?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">{post.sender}</span>
                                <span className="text-xs text-gray-500">
                                    {new Date(post.timeStamp).toLocaleString()}
                                </span>
                            </div>
                            <p className="mt-2">{post.text}</p>
                            {post.imageUrl && (
                                <img src={post.imageUrl} alt="Post image" className="mt-2 max-w-full h-auto rounded" loading="lazy" />
                            )}
                            <div className="flex gap-4 mt-2 text-sm text-gray-500">
                                <span>❤️ {post.likes?.length || 0}</span>
                                <span>💬 {post.comments?.length || 0}</span>
                                <span>👁 {post.viewCount || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
            <div ref={sentinelRef} className="h-1" />
            {loadingMore && (
                <div className="flex justify-center p-4">
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                </div>
            )}
            {!hasMore && posts.length > 0 && (
                <p className="text-center text-xs text-gray-400 py-4">You're all caught up</p>
            )}
            {posts.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-3 opacity-40">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
                    </svg>
                    <p>Nothing here yet. Be the first to post!</p>
                </div>
            )}
        </div>
    );
}

export default FeedNoSSR;