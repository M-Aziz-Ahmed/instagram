"use client";

import { Fragment } from "react";

const SIZE = 10;
const LETTERS = "ABCDEFGHIJ".split("");

export default function BattleshipGrid({ title, grid, shots, showShips, canFire, onFire, small }) {
    return (
        <div className="w-full">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 text-center">{title}</p>
            <div className="inline-block w-full">
                <div className="grid" style={{ gridTemplateColumns: `auto repeat(${SIZE}, 1fr)`, gap: "1px" }}>
                    <div />
                    {LETTERS.map((l) => (
                        <div key={l} className="text-[8px] text-gray-400 text-center leading-none flex items-end justify-center pb-0.5">{l}</div>
                    ))}
                    {Array.from({ length: SIZE }).map((_, r) => (
                        <Fragment key={`row${r}`}>
                            <div className="text-[8px] text-gray-400 flex items-center justify-center pr-0.5">{r + 1}</div>
                            {Array.from({ length: SIZE }).map((_, c) => {
                                const shot = shots?.[r]?.[c];
                                const isShip = showShips && grid?.[r]?.[c] === "S";
                                const isHitShip = showShips && grid?.[r]?.[c] === "X";
                                let bg = "#1e3a5f";
                                if (isShip) bg = "#64748b";
                                if (shot === "M") bg = "#334155";
                                if (shot === "H" || isHitShip) bg = "#dc2626";
                                const fireable = canFire && !shot;
                                return (
                                    <div
                                        key={`${r}-${c}`}
                                        onClick={() => fireable && onFire?.(r, c)}
                                        className="relative flex items-center justify-center rounded-[1px]"
                                        style={{ aspectRatio: "1", backgroundColor: bg, cursor: fireable ? "crosshair" : "default" }}
                                    >
                                        {shot === "M" && <span className="w-1/3 h-1/3 rounded-full bg-slate-400/60" />}
                                        {shot === "H" && <span className="text-white text-[10px] font-bold leading-none">&times;</span>}
                                    </div>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}
