"use client";

import { useRef, useState } from "react";
import { useUser } from "@/context/UserContext";

export default function LoginForm({ onSuccess }) {
    const { reloadUser }          = useUser();
    const [step, setStep]         = useState("email"); // "email" | "otp"
    const [email, setEmail]       = useState("");
    const [otp, setOtp]           = useState(["", "", "", "", "", ""]);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState("");
    const [resendCooldown, setResendCooldown] = useState(0);
    const inputRefs               = useRef([]);

    // ── Step 1: send OTP ──────────────────────────────────────────────────────
    const handleSendOTP = async (e) => {
        e?.preventDefault();
        if (!email.trim() || loading) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/send-otp", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ email: email.trim() }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setStep("otp");
            startCooldown();
        } catch {
            setError("Network error. Try again.");
        } finally {
            setLoading(false);
        }
    };

    const startCooldown = () => {
        setResendCooldown(60);
        const t = setInterval(() => {
            setResendCooldown((n) => { if (n <= 1) { clearInterval(t); return 0; } return n - 1; });
        }, 1000);
    };

    // ── OTP input handling ────────────────────────────────────────────────────
    const handleOtpChange = (i, val) => {
        const v = val.replace(/\D/g, "").slice(0, 1);
        const next = [...otp];
        next[i] = v;
        setOtp(next);
        if (v && i < 5) inputRefs.current[i + 1]?.focus();
        // Auto-submit when all 6 filled
        if (v && next.every(Boolean)) handleVerify(next.join(""));
    };

    const handleOtpKeyDown = (i, e) => {
        if (e.key === "Backspace" && !otp[i] && i > 0) {
            inputRefs.current[i - 1]?.focus();
        }
    };

    const handleOtpPaste = (e) => {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (pasted.length === 6) {
            const arr = pasted.split("");
            setOtp(arr);
            handleVerify(pasted);
        }
    };

    // ── Step 2: verify OTP ────────────────────────────────────────────────────
    const handleVerify = async (code) => {
        if (loading) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/verify-otp", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ email: email.trim(), code }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); setOtp(["","","","","",""]); inputRefs.current[0]?.focus(); return; }
            await reloadUser(data.user);
            onSuccess?.(data.needsSetup);
        } catch {
            setError("Network error. Try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-sm">
            {step === "email" ? (
                <form onSubmit={handleSendOTP} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Email address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setError(""); }}
                            placeholder="you@example.com"
                            autoFocus
                            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-black transition-colors"
                        />
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <button
                        type="submit"
                        disabled={!email.trim() || loading}
                        className="w-full bg-black text-white font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-gray-800 transition-colors"
                    >
                        {loading ? "Sending…" : "Continue"}
                    </button>
                </form>
            ) : (
                <div className="flex flex-col gap-5">
                    <div>
                        <p className="text-sm text-gray-600 mb-4">
                            Enter the 6-digit code sent to <span className="font-semibold text-gray-900">{email}</span>
                        </p>
                        {/* 6-box OTP input */}
                        <div className="flex gap-1.5 sm:gap-2 justify-center" onPaste={handleOtpPaste}>
                            {otp.map((v, i) => (
                                <input
                                    key={i}
                                    ref={(el) => (inputRefs.current[i] = el)}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={v}
                                    onChange={(e) => handleOtpChange(i, e.target.value)}
                                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                    autoFocus={i === 0}
                                    className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-black border-2 border-gray-200 rounded-xl outline-none focus:border-black transition-colors"
                                />
                            ))}
                        </div>
                    </div>

                    {error && <p className="text-xs text-red-500 text-center">{error}</p>}

                    {loading && (
                        <div className="flex justify-center">
                            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                        </div>
                    )}

                    <div className="flex flex-col gap-2 items-center">
                        <button
                            onClick={() => { setStep("email"); setOtp(["","","","","",""]); setError(""); }}
                            className="text-sm text-gray-500 hover:text-gray-800"
                        >
                            ← Change email
                        </button>
                        <button
                            onClick={() => { if (!resendCooldown) { setOtp(["","","","","",""]); handleSendOTP(); } }}
                            disabled={!!resendCooldown || loading}
                            className="text-sm text-blue-500 hover:text-blue-600 disabled:opacity-40"
                        >
                            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
