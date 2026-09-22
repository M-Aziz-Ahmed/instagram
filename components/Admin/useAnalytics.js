"use client";

// Shared loader for all admin analytics endpoints. Wire up parameters once,
// let the dashboard + analytics pages stay tiny.
import { useCallback, useEffect, useRef, useState } from "react";

export default function useAnalytics({ granularity = "day", days = 30, locationDays = 30 } = {}) {
    const [state, setState] = useState({
        overview: null,
        growth: null,
        devices: null,
        locations: null,
        loading: true,
    });
    const flagRef = useRef(0);

    const load = useCallback(async ({ granularity: g, days: d, locationDays: ld } = {}) => {
        const flag = ++flagRef.current;
        setState((s) => ({ ...s, loading: true }));
        const q = `?granularity=${encodeURIComponent(g || "day")}&days=${d || 30}`;
        try {
            const [overview, growth, devices, locations] = await Promise.all([
                fetch("/api/admin/analytics/overview").then((r) => (r.ok ? r.json() : null)),
                fetch(`/api/admin/analytics/growth${q}`).then((r) => (r.ok ? r.json() : null)),
                fetch(`/api/admin/analytics/devices?days=${ld || 30}`).then((r) => (r.ok ? r.json() : null)),
                fetch(`/api/admin/analytics/locations?days=${ld || 30}`).then((r) => (r.ok ? r.json() : null)),
            ]);
            if (flag !== flagRef.current) return;
            setState({ overview, growth, devices, locations, loading: false });
        } catch {
            if (flag !== flagRef.current) return;
            setState((s) => ({ ...s, loading: false }));
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => load({ granularity, days, locationDays }), 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [granularity, days, locationDays]);

    return { ...state, reload: load, current: { granularity, days, locationDays } };
}