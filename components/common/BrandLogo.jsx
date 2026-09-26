import Image from "next/image";

// The AnonTweet mark (generated from public/Anon.png by tools/gen-icons.mjs).
// Used wherever the product needs to identify itself, so the wordmark styling
// stays identical across login, invites and profile setup.
export default function BrandLogo({ size = 32, withWordmark = true, className = "" }) {
    return (
        <span className={`inline-flex items-center gap-2.5 ${className}`}>
            <Image
                src="/icon-192.png"
                alt=""
                width={size}
                height={size}
                priority
                className="rounded-lg shrink-0 object-contain"
                style={{ width: size, height: size }}
            />
            {withWordmark && (
                <span className="font-black tracking-tight text-gray-900 dark:text-gray-100 text-xl">
                    AnonTweet
                </span>
            )}
        </span>
    );
}
