import mongoose from "mongoose";

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;

    try {
        await mongoose.connect(process.env.mongobg_uri || 'mongodb+srv://azizahmed1:E6NabxbcQXoc8jWL@app.ipk7p3c.mongodb.net/?appName=app');
        console.log("MongoDB connected");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        throw error;
    }
};

export default connectDB;