import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
    },
});

export async function sendOTPEmail(email, code) {
    await transporter.sendMail({
        from:    process.env.GMAIL_USER,
        to:      email,
        subject: "Your AnonFeed Login Code",
        html: `
            <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
                <h1 style="font-size:24px;font-weight:900;margin:0 0 8px">AnonFeed</h1>
                <p style="color:#6b7280;margin:0 0 24px">Your one-time login code:</p>
                <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;letter-spacing:8px;font-size:36px;font-weight:900;color:#111">
                    ${code}
                </div>
                <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">
                    This code expires in 10 minutes. If you didn't request this, ignore this email.
                </p>
            </div>
        `,
    });
}
