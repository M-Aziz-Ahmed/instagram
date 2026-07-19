"use client";

import { useState, useEffect, useRef, useCallback } from "react";

function ShareIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
    );
}

function LinkIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-3.04a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.34 8.374" />
        </svg>
    );
}

function QRIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
        </svg>
    );
}

function TwitterIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    );
}

function TikTokIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.51a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.75a8.18 8.18 0 0 0 3.76.93V6.69z" />
        </svg>
    );
}

function WhatsAppIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
    );
}

function FacebookIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
    );
}

function InstagramIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
    );
}

function TelegramIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.013-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
    );
}

function RedditIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
        </svg>
    );
}

function LinkedInIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
    );
}

function EmailIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
        </svg>
    );
}

function DownloadIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
    );
}

const SOCIALS = [
    { id: "copy", label: "Copy Link", icon: <LinkIcon />, color: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300", hoverColor: "hover:bg-gray-200 dark:hover:bg-gray-600" },
    { id: "twitter", label: "X", icon: <TwitterIcon />, color: "bg-black dark:bg-gray-800 text-white", hoverColor: "hover:bg-gray-800 dark:hover:bg-gray-700" },
    { id: "whatsapp", label: "WhatsApp", icon: <WhatsAppIcon />, color: "bg-[#25D366]/10 text-[#25D366]", hoverColor: "hover:bg-[#25D366]/20" },
    { id: "facebook", label: "Facebook", icon: <FacebookIcon />, color: "bg-[#1877F2]/10 text-[#1877F2]", hoverColor: "hover:bg-[#1877F2]/20" },
    { id: "telegram", label: "Telegram", icon: <TelegramIcon />, color: "bg-[#0088cc]/10 text-[#0088cc]", hoverColor: "hover:bg-[#0088cc]/20" },
    { id: "reddit", label: "Reddit", icon: <RedditIcon />, color: "bg-[#FF4500]/10 text-[#FF4500]", hoverColor: "hover:bg-[#FF4500]/20" },
    { id: "linkedin", label: "LinkedIn", icon: <LinkedInIcon />, color: "bg-[#0A66C2]/10 text-[#0A66C2]", hoverColor: "hover:bg-[#0A66C2]/20" },
    { id: "tiktok", label: "TikTok", icon: <TikTokIcon />, color: "bg-black dark:bg-gray-800 text-white", hoverColor: "hover:bg-gray-800 dark:hover:bg-gray-700" },
    { id: "instagram", label: "Instagram", icon: <InstagramIcon />, color: "bg-gradient-to-br from-[#F58529]/10 via-[#DD2A7B]/10 to-[#8134AF]/10 text-[#DD2A7B]", hoverColor: "hover:from-[#F58529]/20 hover:via-[#DD2A7B]/20 hover:to-[#8134AF]/20" },
    { id: "email", label: "Email", icon: <EmailIcon />, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-500", hoverColor: "hover:bg-blue-100 dark:hover:bg-blue-900/30" },
];

function generateQRCode(text, size = 180) {
    const qr = document.createElement("canvas");
    qr.width = size;
    qr.height = size;
    const ctx = qr.getContext("2d");

    const len = text.length;
    const moduleCount = Math.min(Math.max(Math.ceil(Math.sqrt(len * 4)), 21), 41);
    const cellSize = size / (moduleCount + 2);
    const offset = cellSize;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = "#000000";

    function drawFinderPattern(x, y) {
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < 7; j++) {
                const isOuter = i === 0 || i === 6 || j === 0 || j === 6;
                const isInner = i >= 2 && i <= 4 && j >= 2 && j <= 4;
                if (isOuter || isInner) {
                    ctx.fillRect(offset + (x + i) * cellSize, offset + (y + j) * cellSize, cellSize, cellSize);
                }
            }
        }
    }

    drawFinderPattern(0, 0);
    drawFinderPattern(moduleCount - 7, 0);
    drawFinderPattern(0, moduleCount - 7);

    const hash = Array.from(text).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    let seed = Math.abs(hash);

    for (let i = 0; i < moduleCount; i++) {
        for (let j = 0; j < moduleCount; j++) {
            if ((i < 8 && j < 8) || (i >= moduleCount - 8 && j < 8) || (i < 8 && j >= moduleCount - 8)) continue;
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            if (seed % 3 !== 0) {
                ctx.fillRect(offset + i * cellSize, offset + j * cellSize, cellSize, cellSize);
            }
        }
    }

    return qr.toDataURL("image/png");
}

export default function ShareButton({ postId, text, imageUrl, className = "" }) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [showQR, setShowQR] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [downloadingQR, setDownloadingQR] = useState(false);
    const modalRef = useRef(null);

    useEffect(() => {
        const checkMobile = () => setIsMobile("ontouchstart" in window || navigator.maxTouchPoints > 0);
        checkMobile();
    }, []);

    useEffect(() => {
        const handleClick = (e) => {
            if (modalRef.current && !modalRef.current.contains(e.target)) {
                setOpen(false);
                setShowQR(false);
            }
        };
        if (open) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [open]);

    const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/post/${postId}` : "";
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(text || "Check this out");

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = shareUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: text || "Check this out", text: text || "", url: shareUrl });
            } catch {}
        } else {
            setOpen(true);
        }
    };

    const handleClick = () => {
        if (isMobile && navigator.share) {
            handleNativeShare();
        } else {
            setOpen(true);
        }
    };

    const handleShare = useCallback((id) => {
        switch (id) {
            case "copy":
                copyLink();
                break;
            case "twitter":
                window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, "_blank", "noopener,noreferrer");
                break;
            case "whatsapp":
                window.open(`https://wa.me/?text=${encodedText}%20${encodedUrl}`, "_blank", "noopener,noreferrer");
                break;
            case "facebook":
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, "_blank", "noopener,noreferrer");
                break;
            case "telegram":
                window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, "_blank", "noopener,noreferrer");
                break;
            case "reddit":
                window.open(`https://reddit.com/submit?url=${encodedUrl}&title=${encodedText}`, "_blank", "noopener,noreferrer");
                break;
            case "linkedin":
                window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, "_blank", "noopener,noreferrer");
                break;
            case "tiktok":
                window.open(`https://www.tiktok.com/share?url=${encodedUrl}`, "_blank", "noopener,noreferrer");
                break;
            case "instagram":
                copyLink();
                break;
            case "email":
                window.open(`mailto:?subject=${encodedText}&body=${encodedText}%0A%0A${encodedUrl}`, "_blank");
                break;
        }
        if (id !== "copy") setOpen(false);
    }, [shareUrl, encodedText, encodedUrl]);

    const handleQRCode = () => {
        if (showQR) {
            setShowQR(false);
            return;
        }
        const url = generateQRCode(shareUrl);
        setQrDataUrl(url);
        setShowQR(true);
    };

    const downloadQR = () => {
        if (!qrDataUrl) return;
        setDownloadingQR(true);
        const link = document.createElement("a");
        link.download = `share-${postId}.png`;
        link.href = qrDataUrl;
        link.click();
        setTimeout(() => setDownloadingQR(false), 1000);
    };

    return (
        <div className={`relative ${className}`}>
            <button
                onClick={handleClick}
                aria-label="Share"
                className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors min-h-[44px] px-2 py-1 rounded-lg"
            >
                <ShareIcon />
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-fade-in"
                    onClick={() => { setOpen(false); setShowQR(false); }}
                >
                    <div
                        ref={modalRef}
                        className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl w-full sm:w-[22rem] max-h-[85vh] shadow-2xl border border-gray-200 dark:border-gray-700 animate-slide-up overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 pb-2">
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-base text-gray-900 dark:text-gray-100">
                                    {showQR ? "QR Code" : "Share to"}
                                </span>
                                <button
                                    onClick={() => { setOpen(false); setShowQR(false); }}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 -mr-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    aria-label="Close"
                                >
                                    <CloseIcon />
                                </button>
                            </div>
                        </div>

                        {copied && (
                            <div className="mx-4 mb-3 px-3 py-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-600 dark:text-green-400 text-sm font-medium text-center flex items-center justify-center gap-2">
                                <CheckIcon />
                                Link copied to clipboard
                            </div>
                        )}

                        {showQR ? (
                            <div className="px-4 pb-6">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="bg-white p-4 rounded-2xl shadow-inner border border-gray-100 dark:border-gray-800">
                                        {qrDataUrl && (
                                            <img src={qrDataUrl} alt="QR Code" className="w-44 h-44" />
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-[250px]">
                                        Scan this code to open the post in any device
                                    </p>
                                    <button
                                        onClick={downloadQR}
                                        disabled={downloadingQR}
                                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50"
                                    >
                                        <DownloadIcon />
                                        {downloadingQR ? "Saving..." : "Download QR"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="px-4 pb-6">
                                <div className="grid grid-cols-5 gap-2 mb-3">
                                    {SOCIALS.map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => handleShare(s.id)}
                                            className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all ${s.color} ${s.hoverColor} active:scale-95`}
                                        >
                                            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-gray-900/50 shadow-sm">
                                                {s.icon}
                                            </span>
                                            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 leading-tight text-center">
                                                {s.id === "copy" && copied ? "Copied!" : s.label}
                                            </span>
                                        </button>
                                    ))}
                                    <button
                                        onClick={handleQRCode}
                                        className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all bg-purple-50 dark:bg-purple-900/20 text-purple-500 hover:bg-purple-100 dark:hover:bg-purple-900/30 active:scale-95"
                                    >
                                        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-gray-900/50 shadow-sm">
                                            <QRIcon />
                                        </span>
                                        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400 leading-tight text-center">
                                            QR Code
                                        </span>
                                    </button>
                                </div>

                                {isMobile && (
                                    <button
                                        onClick={() => { setOpen(false); handleNativeShare(); }}
                                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-[0.98]"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                                        </svg>
                                        More sharing options
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
