"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

export default function ForgotPinClient() {
    const { reloadUser } = useUser();
    const router = useRouter();
    const [step, setStep]       = useState("email");
    const [email, setEmail]     = useState("");
    const [otp, setOtp]         = useState(["", "", "", "", "", ""]);
    const [pin, setPin]         = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState("");
    const [cooldown, setCooldown] = useState(0);
    const inputRefs             = useRef([]);

    const startCooldown = () => {
        setCooldown(60);
        const t = setInterval(() => {
            setCooldown((n) => { if (n <= 1) { clearInterval(t); return 0; } return n - 1; });
        }, 1000);
    };

    const sendCode = async (e) => {
        e?.preventDefault();
        if (!email.trim() || loading) return;
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/send-otp", {
                method:  "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ email: email.trim(), force: true }),
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

    const handleOtpChange = (i, val) => {
        const v = val.replace(/\D/g, "").slice(0, 1);
        const next = [...otp];
        next[i] = v;
        setOtp(next);
        if (v && i < 5) inputRefs.current[i + 1]?.focus();
    };

    const handleOtpPaste = (e) => {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (pasted.length === 6) setOtp(pasted.split(""));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;
        if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
            setError("PIN must be 4\u20138 digits");
            return;
        }
        if (pin !== confirm) {
            setError("PINs do not match");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/forgot-pin", {
                method:  "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ email: email.trim(), code: otp.join(""), pin }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            await reloadUser(data.user);
            await new Promise((resolve) => setTimeout(resolve, 100));
            router.replace("/");
        } catch {
            setError("Network error. Try again.");
        } finally {
            setLoading(false);
        }
    };

    const codeComplete = otp.every(Boolean);

    return (
        <div className="min-h-dvh flex items-center justify-center bg-white dark:bg-gray-950 p-4">
            <div className="w-full max-w-sm flex flex-col gap-5">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100">Reset your PIN</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        We&apos;ll send a code to your email, then you can set a new PIN.
                    </p>
                </div>

                {step === "email" && (
                    <form onSubmit={sendCode} className="flex flex-col gap-4">
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
                        {error && <p className="text-xs text-red-500">{error}</p>}
                        <button
                            type="submit"
                            disabled={!email.trim() || loading}
                            className="w-full bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                        >
                            {loading ? "Sending\u2026" : "Send code"}
                        </button>
                        <Link href="/login" className="text-sm text-blue-500 hover:underline text-center">
                            Back to login
                        </Link>
                    </form>
                )}

                {step === "otp" && (
                    <div className="flex flex-col gap-5">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
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
                                    autoFocus={i === 0}
                                    className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-black border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl outline-none focus:border-black dark:focus:border-gray-500 transition-colors"
                                />
                            ))}
                        </div>
                        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
                        <button
                            onClick={() => { if (codeComplete && !loading) { setStep("pin"); setError(""); } }}
                            disabled={!codeComplete || loading}
                            className="w-full bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                        >
                            Continue
                        </button>
                        <button
                            onClick={() => { if (!cooldown) { setOtp(["","","","","",""]); sendCode(); } }}
                            disabled={!!cooldown || loading}
                            className="text-sm text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-40"
                        >
                            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                        </button>
                    </div>
                )}

                {step === "pin" && (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                New PIN
                            </label>
                            <input
                                type="password"
                                value={pin}
                                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
                                placeholder="4-8 digits"
                                inputMode="numeric"
                                maxLength={8}
                                autoFocus
                                className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-xl font-mono tracking-widest rounded-xl px-4 py-3 outline-none focus:border-black dark:focus:border-gray-500 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Confirm PIN
                            </label>
                            <input
                                type="password"
                                value={confirm}
                                onChange={(e) => { setConfirm(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
                                placeholder="Repeat PIN"
                                inputMode="numeric"
                                maxLength={8}
                                className="w-full border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-xl font-mono tracking-widest rounded-xl px-4 py-3 outline-none focus:border-black dark:focus:border-gray-500 transition-colors"
                            />
                        </div>
                        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
                        <button
                            type="submit"
                            disabled={!pin || !confirm || loading}
                            className="w-full bg-black dark:bg-gray-100 text-white dark:text-gray-900 font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                        >
                            {loading ? "Saving\u2026" : "Set new PIN"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
