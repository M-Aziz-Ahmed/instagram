import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a base64 data URL or a Buffer to Cloudinary.
 * Returns the secure URL.
 */
export async function uploadImage(dataUrl) {
    const result = await cloudinary.uploader.upload(dataUrl, {
        folder: "anon-feed",
        transformation: [{ width: 1200, crop: "limit" }, { quality: "auto" }],
    });
    return result.secure_url;
}

export default cloudinary;
