import mongoose from "mongoose";

const MONGODB_URI = process.env.mongobg_uri || process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
    console.error("MongoDB connection string not set (check mongobg_uri / MONGODB_URI / MONGO_URI)");
}

let cached = global.mongoose;
if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
    if (cached.conn) return cached.conn;

    if (!MONGODB_URI) {
        throw new Error("MongoDB connection string not set");
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI, {
            maxPoolSize: 5,
            minPoolSize: 0,
            socketTimeoutMS: 30000,
            serverSelectionTimeoutMS: 10000,
            heartbeatFrequencyMS: 30000,
        }).then((mongoose) => mongoose);
    }

    cached.conn = await cached.promise;
    return cached.conn;
};

export default connectDB;
