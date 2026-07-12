import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOTPEmail(email, code) {
    await resend.emails.send({
        from:    "AnonFeed <onboarding@resend.dev>",
        to:      email,
        subject: `${code} is your AnonFeed code`,
        html: `
            <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
                <h1 style="font-size:24px;font-weight:900;margin:0 0 8px">AnonFeed</h1>
                <p style="color:#6b7280;margin:0 0 24px">Your one-time login code:</p>
                <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;letter-spacing:8px;font-size:36px;font-weight:900;color:#111">
                    ${code}
                </div>
                <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">
                    This code expires in 5 minutes. If you didn't request this, ignore this email.
                </p>
            </div>
        `,
    });
}
