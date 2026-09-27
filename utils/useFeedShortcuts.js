"use client";

import { useEffect, useRef, useState } from "react";

// Keyboard shortcuts for the social feed.
//
// The feed is a scroll-driven list with an infinite sentinel, which makes it
// awkward to drive from the keyboard: Tab reaches the controls of one post and
// then has to cross every post in between to reach the next one, and there was
// no way to get back to the composer once you had scrolled away from it.
//
// Every shortcut is suppressed while the reader is typing, so none of them can
// fire from inside the comment box, the composer, or a renamed post. That check
// is the whole reason this is a hook and not a set of onKeyDown handlers on the
// feed container: a container handler still receives bubbled key events from
// every input inside it.
const SHORTCUTS = [
    { keys: "J", label: "Next post" },
    { keys: "K", label: "Previous post" },
    { keys: "N", label: "New post" },
    { keys: "R", label: "Refresh feed" },
    { keys: "/", label: "Search" },
    { keys: "?", label: "Show this help" },
    { keys: "Esc", label: "Close" },
];

// True when the event originated in something the reader is typing into.
function isTyping(target) {
    if (!target) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
}

/**
 * @param {object}   opts
 * @param {Function} opts.onNext      move to the next post
 * @param {Function} opts.onPrevious  move to the previous post
 * @param {Function} opts.onRefresh   refresh the feed
 * @param {boolean}  opts.enabled     false disables every shortcut (e.g. search open)
 */
export default function useFeedShortcuts({ onNext, onPrevious, onRefresh, enabled = true }) {
    const [showHelp, setShowHelp] = useState(false);
    // Handlers live in a ref so a caller re-creating its callbacks on every
    // render does not re-bind the listener on every render. Written in an effect
    // rather than during render: assigning a ref while rendering is exactly the
    // thing React's compiler refuses to reason about, and this hook would be the
    // one place in the feed where that bit us.
    const handlers = useRef({});
    useEffect(() => {
        handlers.current = { onNext, onPrevious, onRefresh };
    });

    useEffect(() => {
        if (!enabled) return;

        const onKeyDown = (e) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            // Never swallow a key the reader is holding down to select text.
            if (isTyping(e.target)) {
                if (e.key === "Escape") e.target.blur?.();
                return;
            }

            switch (e.key) {
                case "j":
                case "J":
                    e.preventDefault();
                    handlers.current.onNext?.();
                    break;
                case "k":
                case "K":
                    e.preventDefault();
                    handlers.current.onPrevious?.();
                    break;
                case "r":
                case "R":
                    e.preventDefault();
                    handlers.current.onRefresh?.();
                    break;
                case "n":
                case "N":
                    e.preventDefault();
                    // Compose already listens for this event, so the shortcut
                    // reuses that path instead of reaching into it.
                    window.dispatchEvent(new Event("open-compose"));
                    break;
                case "/":
                    e.preventDefault();
                    // Focus the search field rather than opening a route: there
                    // are two SearchBar instances (desktop and mobile) and only
                    // one of them is visible at any width.
                    focusVisibleSearch();
                    break;
                case "?":
                    e.preventDefault();
                    setShowHelp((v) => !v);
                    break;
                case "Escape":
                    setShowHelp(false);
                    break;
                default:
                    break;
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [enabled]);

    return { showHelp, setShowHelp, shortcuts: SHORTCUTS };
}

function focusVisibleSearch() {
    const inputs = Array.from(document.querySelectorAll('input[type="search"], input[placeholder*="Search" i]'));
    // offsetParent is null for display:none, which is how the hidden duplicate
    // is identified without hardcoding a class name that Tailwind may reorder.
    const visible = inputs.find((el) => el.offsetParent !== null) || inputs[0];
    if (!visible) return;
    visible.focus();
    visible.select?.();
}
