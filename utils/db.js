import mongoose from "mongoose";

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    const uri = process.env.mongobg_uri || process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        const err = new Error("MongoDB connection string not set (check mongobg_uri / MONGODB_URI / MONGO_URI)");
        console.error(err.message);
        throw err;
    }
    try {
        console.log("Connecting to MongoDB using env var...");
        await mongoose.connect(uri);
        console.log("MongoDB connected");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        throw error;
    }
};

export default connectDB;
