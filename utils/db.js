import mongoose from "mongoose";

const MONGODB_URI = process.env.mongobg_uri || "mongodb://39.62.215.83:27017";

let cached = null;

async function connectDB() {
    if (cached) return cached;

    const conn = await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    });
    cached = conn;
    return conn;
}

export default connectDB;
