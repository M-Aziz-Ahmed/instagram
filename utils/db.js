import mongoose from "mongoose";

const MONGODB_URI = process.env.mongobg_uri || process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
    console.error("MongoDB connection string not set (check mongobg_uri / MONGODB_URI / MONGO_URI)");
}

async function resolveSRV(uri) {
    if (!uri.startsWith("mongodb+srv://")) return uri;
    const url = new URL(uri);
    const host = url.hostname;
    const doh = await fetch(
        `https://cloudflare-dns.com/dns-query?name=_mongodb._tcp.${host}&type=SRV`,
        { headers: { Accept: "application/dns-json" } }
    );
    const { Answer } = await doh.json();
    const srvRecords = (Answer || [])
        .filter((a) => a.type === 33)
        .map((a) => {
            const parts = a.data.split(" ");
            return { name: parts[3], port: parseInt(parts[2], 10) };
        });
    if (srvRecords.length === 0) throw new Error(`No SRV records found for _mongodb._tcp.${host}`);
    const userinfo = url.password
        ? `${encodeURIComponent(url.username)}:${encodeURIComponent(url.password)}@`
        : url.username
        ? `${encodeURIComponent(url.username)}@`
        : "";
    const hosts = srvRecords.map((r) => `${r.name}:${r.port}`).join(",");
    const dbname = url.pathname.slice(1) || "test";
    const params = new URLSearchParams(url.search);
    params.set("ssl", "true");
    params.set("authSource", params.get("authSource") || "admin");
    return `mongodb://${userinfo}${hosts}/${dbname}?${params.toString()}`;
}

let connectionPromise = null;

const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return mongoose.connection;

    if (!MONGODB_URI) {
        throw new Error("MongoDB connection string not set");
    }

    if (!connectionPromise) {
        connectionPromise = (async () => {
            const resolved = await resolveSRV(MONGODB_URI);
            return mongoose.connect(resolved, {
                maxPoolSize: 5,
                minPoolSize: 0,
                socketTimeoutMS: 30000,
                serverSelectionTimeoutMS: 10000,
                heartbeatFrequencyMS: 30000,
                tls: true,
            });
        })();
    }

    await connectionPromise;
    return mongoose.connection;
};

export default connectDB;
