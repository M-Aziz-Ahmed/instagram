"use client";

import { useRef, useState } from "react";
import { useUser } from "@/context/UserContext";

export default function LoginForm({ onSuccess }) {
    const { reloadUser }          = useUser();
    const [step, setStep]         = useState("email");
    const [email, setEmail]       = useState("");
    const [otp, setOtp]           = useState(["", "", "", "", "", ""]);
    const [pin, setPin]           = useState("");
    const [hasPin, setHasPin]     = useState(false);
    const [inviteCode, setInviteCode] = useState("");
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState("");
    const [resendCooldown, setResendCooldown] = useState(0);
    const inputRefs               = useRef([]);

    const handleSendOTP = async (e) => {
        e?.preventDefault();
        if (!email.trim() || loading) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/send-otp", {
                method:  "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ email: email.trim() }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            if (data.hasPin) {
                setHasPin(true);
                setStep("pin");
            } else {
                setStep("otp");
                startCooldown();
            }
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

    const handleOtpChange = (i, val) => {
        const v = val.replace(/\D/g, "").slice(0, 1);
        const next = [...otp];
        next[i] = v;
        setOtp(next);
        if (v && i < 5) inputRefs.current[i + 1]?.focus();
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

    const handleVerify = async (code) => {
        if (loading) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/verify-otp", {
                method:  "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ email: email.trim(), code, inviteCode: inviteCode.trim() || undefined }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); setOtp(["","","","","",""]); inputRefs.current[0]?.focus(); return; }
            
            await reloadUser(data.user);
            await new Promise(resolve => setTimeout(resolve, 100));
            onSuccess?.(data.needsSetup);
        } catch {
            setError("Network error. Try again.");
        } finally {
            setLoading(false);
        }
    };

    const handlePinSubmit = async (e) => {
        e?.preventDefault();
        if (!pin.trim() || loading) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/verify-pin", {
                method:  "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ email: email.trim(), pin: pin.trim() }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); setPin(""); return; }

            await reloadUser(data.user);
            await new Promise(resolve => setTimeout(resolve, 100));
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            Email address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setError(""); }}
                            placeholder="you@example.com"
                            autoFocus
                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-3 text-sm outline-none focus:border-black dark:focus:border-gray-500 transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            Invite code <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                            placeholder="XXXXXXXX"
                            maxLength={8}
                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-3 text-sm font-mono tracking-wider outline-none focus:border-black dark:focus:border-gray-500 transition-colors"
                        />
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <button
                        type="submit"
                        disabled={!email.trim() || loading}
                        className="w-full bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                    >
                        {loading ? "Sending\u2026" : "Continue"}
                    </button>
                </form>
            ) : step === "pin" ? (
                <form onSubmit={handlePinSubmit} className="flex flex-col gap-5">
                    <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Enter the PIN for <span className="font-semibold text-gray-900 dark:text-gray-100">{email}</span>
                        </p>
                        <input
                            type="password"
                            value={pin}
                            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
                            placeholder="PIN"
                            autoFocus
                            inputMode="numeric"
                            maxLength={8}
                            className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-xl font-mono tracking-widest rounded-xl px-4 py-3 outline-none focus:border-black dark:focus:border-gray-500 transition-colors"
                        />
                    </div>

                    {error && <p className="text-xs text-red-500 text-center">{error}</p>}

                    {loading && (
                        <div className="flex justify-center">
                            <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-700 dark:border-t-gray-300 rounded-full animate-spin" />
                        </div>
                    )}

                    <div className="flex flex-col gap-2 items-center">
                        <button
                            type="submit"
                            disabled={!pin.trim() || loading}
                            className="w-full bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                        >
                            {loading ? "Verifying\u2026" : "Log in"}
                        </button>
                        <button
                            onClick={() => { setStep("email"); setPin(""); setError(""); setHasPin(false); }}
                            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        >
                            {"\u2190"} Change email
                        </button>
                    </div>
                </form>
            ) : (
                <div className="flex flex-col gap-5">
                    <div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Enter the 6-digit code sent to <span className="font-semibold text-gray-900 dark:text-gray-100">{email}</span>
                        </p>
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
                                    className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-black border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl outline-none focus:border-black dark:focus:border-gray-500 transition-colors"
                                />
                            ))}
                        </div>
                    </div>

                    {error && <p className="text-xs text-red-500 text-center">{error}</p>}

                    {loading && (
                        <div className="flex justify-center">
                            <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-700 border-t-gray-700 dark:border-t-gray-300 rounded-full animate-spin" />
                        </div>
                    )}

                    <div className="flex flex-col gap-2 items-center">
                        <button
                            onClick={() => { setStep("email"); setOtp(["","","","","",""]); setError(""); }}
                            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        >
                            {"\u2190"} Change email
                        </button>
                        <button
                            onClick={() => { if (!resendCooldown) { setOtp(["","","","","",""]); handleSendOTP(); } }}
                            disabled={!!resendCooldown || loading}
                            className="text-sm text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-40"
                        >
                            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
