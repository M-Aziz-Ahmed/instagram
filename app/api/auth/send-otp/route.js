import connectDB from "@/utils/db";
import OTP from "@/models/otp";
import { sendOTPEmail } from "@/utils/email";

function generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request) {
    try {
        const { email } = await request.json();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return Response.json({ error: "Valid email required" }, { status: 400 });
        }

        await connectDB();

        // Rate limit: max 3 OTPs per email in last 10 minutes
        const recent = await OTP.countDocuments({
            email:     email.toLowerCase(),
            expiresAt: { $gt: new Date(Date.now() - 10 * 60 * 1000) },
        });
        if (recent >= 3) {
            return Response.json({ error: "Too many attempts. Wait 10 minutes." }, { status: 429 });
        }

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

        await OTP.create({ email: email.toLowerCase(), code, expiresAt });
        
        // Wrap email sending in try-catch to handle failures gracefully
        try {
            await sendOTPEmail(email, code);
        } catch (emailError) {
            console.error("Failed to send OTP email:", emailError);
            return Response.json({ error: "Failed to send email. Please try again." }, { status: 500 });
        }

        return Response.json({ ok: true });
    } catch (error) {
        console.error(error);
        return Response.json({ error: "Failed to send OTP" }, { status: 500 });
    }
}
