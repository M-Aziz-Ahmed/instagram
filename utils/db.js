import mongoose from "mongoose";

const MONGODB_URI = process.env.mongobg_uri || "mongodb://39.62.217.128:27017";

let cached = null;

async function connectDB() {
    if (cached) return cached;

    const conn = await mongoose.connect(MONGODB_URI);
    cached = conn;
    return conn;
}

export default connectDB;
