"use client";

import BottomNav from "./BottomNav";

export default function LayoutWrapper({ children }) {
    return (
        <>
            <div className="pb-14 lg:pb-0">
                {children}
            </div>
            <BottomNav />
        </>
    );
}
