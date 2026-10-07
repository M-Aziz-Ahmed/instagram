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
        // Why the location panel is empty, when it is empty because the request
        // failed rather than because there is nothing to show.
        errors: {},
    });
    const flagRef = useRef(0);

    const load = useCallback(async ({ granularity: g, days: d, locationDays: ld } = {}) => {
        const flag = ++flagRef.current;
        setState((s) => ({ ...s, loading: true }));
        const q = `?granularity=${encodeURIComponent(g || "day")}&days=${d || 30}`;

        // Report what actually came back rather than flattening every non-2xx
        // into `null`.
        //
        // This is what made the globe look broken when it was merely unreachable:
        // a 401, a 502 from the live-server, or a network failure all became
        // `null`, and the page then rendered "No location data yet." — a claim
        // about the DATA, made because the REQUEST failed. The admin was told
        // they had no users on the map when in fact nobody had asked the
        // database. The distinction is the whole point of the panel.
        const get = async (url) => {
            try {
                const res = await fetch(url);
                if (res.ok) return { data: await res.json(), error: null };
                return { data: null, error: `Request failed (${res.status})` };
            } catch (e) {
                return { data: null, error: e?.message ? `Network error: ${e.message}` : "Network error" };
            }
        };

        try {
            const [overview, growth, devices, locations] = await Promise.all([
                get("/api/admin/analytics/overview"),
                get(`/api/admin/analytics/growth${q}`),
                get(`/api/admin/analytics/devices?days=${ld || 30}`),
                get(`/api/admin/analytics/locations?days=${ld || 30}`),
            ]);
            if (flag !== flagRef.current) return;
            const errors = {};
            if (overview.error) errors.overview = overview.error;
            if (growth.error) errors.growth = growth.error;
            if (devices.error) errors.devices = devices.error;
            if (locations.error) errors.locations = locations.error;
            setState({
                overview: overview.data,
                growth: growth.data,
                devices: devices.data,
                locations: locations.data,
                loading: false,
                errors,
            });
        } catch {
            if (flag !== flagRef.current) return;
            setState((s) => ({ ...s, loading: false, errors: { locations: "Could not reach the server" } }));
        }
    }, []);

    useEffect(() => {
        const t = setTimeout(() => load({ granularity, days, locationDays }), 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [granularity, days, locationDays]);

    return { ...state, reload: load, current: { granularity, days, locationDays } };
}