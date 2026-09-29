"use client";

/**
 * Group settings sheet.
 *
 * ── What this file owns ───────────────────────────────────────────────────
 * Every admin/member action on a group that is not about sending a message:
 * identity, permissions, slow mode, the member cap, the announcement, the
 * invite link, promote/demote/remove, mute, and leave/delete.
 *
 * Several of these had a working server action and NO client caller at all
 * (`demote`, `setSlowMode`, `setMaxMembers`, `regenerateInvite`, `announcement`)
 * or a working action and no client READER (`toggleMute`, whose `mutedBy` array
 * was written by the server and never displayed anywhere). Both halves are
 * wired here.
 *
 * `toggleMute` is rendered here AND in the group chat header, so both write
 * through the same action and read the same field; a window event is emitted so
 * the inbox list can suppress its own badge. The list itself is not this file.
 *
 * ── Errors ───────────────────────────────────────────────────────────────
 * Every write goes through `callApi` and surfaces the server's `error` AND
 * `detail` verbatim. `demote` in particular has three distinct 400s — creator,
 * last admin, not a member — and each of them is the useful message, so a
 * generic "Failed" would throw away the only thing the route told us.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { timeAgo } from "@/utils/timeAgo";

import { getCloudName, getUploadPreset, noteUploadedBytes } from "@/components/Feed/mediaTargetStore";
import useMediaTarget from "@/components/Feed/useMediaTarget";

const MAX_SLOW_MODE_SECONDS = 86400;   // the server's own ceiling
const MAX_LIMIT = 1000;                // the server's own ceiling for maxMembers
const MAX_ANNOUNCEMENT = 500;          // the server slices to 500

/* fetch + JSON + throw with the server's own message attached, so nothing is
 * replaced with a bare "Failed". */
async function callApi(path, options) {
    let res;
    try {
        res = await fetch(path, { credentials: "include", ...options });
    } catch {
        const err = new Error("Network error \u2014 the request did not reach the server");
        err.status = 0;
        throw err;
    }
    let data = {};
    try {
        data = await res.json();
    } catch {
        // Non-JSON body (proxy error page, HTML 502). The status is all there is.
    }
    if (!res.ok) {
        const err = new Error(data.error || `Request failed with HTTP ${res.status}`);
        err.payload = data;
        err.status = res.status;
        throw err;
    }
    return data;
}

function errText(e) {
    const msg = e?.payload?.error || e?.message || "Request failed";
    const detail = e?.payload?.detail;
    return detail && !String(msg).includes(detail) ? `${msg} \u2014 ${detail}` : msg;
}

async function copyText(value) {
    if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
    }
    // A non-secure context has no async clipboard and execCommand is the only
    // path left. Positioned rather than `display:none`, which cannot select.
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
}

const SHEET_INPUT =
    "w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-base sm:text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 transition-colors";
const PRIMARY = "px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40";
const GHOST = "px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors";
const ROW_BTN = "text-xs sm:text-[11px] px-2 min-h-[44px] flex items-center rounded-lg disabled:opacity-40 transition-colors";
const LABEL = "block text-xs text-gray-600 dark:text-gray-400";
const SELECT = "bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 text-base sm:text-xs text-gray-900 dark:text-gray-100 outline-none";

/** House-style toggle: a 44px button around a 44×24 track, so the tap target is
 * 44px rather than the 24px the track alone would give. */
function Toggle({ label, on, onChange, disabled }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={!!on}
            aria-label={`${label}: ${on ? "on" : "off"}`}
            disabled={disabled}
            onClick={onChange}
            className="shrink-0 w-11 h-11 -mr-2 flex items-center justify-end disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white rounded-full"
        >
            <span className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-700"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : ""}`} />
            </span>
        </button>
    );
}

function Field({ label, hint, children }) {
    return (
        <label className="block min-w-0">
            <span className={`${LABEL} mb-1.5 block`}>{label}</span>
            {children}
            {hint && <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">{hint}</span>}
        </label>
    );
}

function Row({ label, hint, children }) {
    return (
        <div className="flex items-start justify-between gap-3 py-1">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
                {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{hint}</p>}
            </div>
            {children}
        </div>
    );
}

function Note({ tone = "info", children }) {
    const cls = {
        warn: "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200",
        danger: "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200",
        info: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300",
    }[tone] || "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300";
    return <div className={`rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${cls}`}>{children}</div>;
}

export default function GroupSettings({ group, user, onClose, onGroupUpdated, onLeave }) {
    // Publishes the resolved storage target for the group avatar upload.
    useMediaTarget({ enabled: !!user?.username });
    const { showToast } = useToast();
    const me = (group.members || []).find((m) => (m.username || m) === user.username) || null;
    const isAdmin = me?.role === "admin";
    const isCreator = group.creator === user.username;
    const isMuted = !!group.mutedBy?.includes(user.username);

    // Older group documents have none of these fields, so every one is read
    // through a default rather than trusted to exist.
    const maxMembers = Number(group.maxMembers) || 0;
    const slowModeSeconds = Math.max(0, Number(group.slowModeSeconds) || 0);
    const memberCount = (group.members || []).length;
    const isFull = maxMembers > 0 && memberCount >= maxMembers;
    const otherAdmins = (group.members || []).filter((m) => (m.role === "admin") && (m.username || m) !== user.username).length;

    const [name, setName] = useState(group.name || "");
    const [description, setDescription] = useState(group.description || "");
    const [avatarUrl, setAvatarUrl] = useState(group.avatarUrl || "");
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [saving, setSaving] = useState(false);
    const [addMemberQuery, setAddMemberQuery] = useState("");
    const [addMemberResults, setAddMemberResults] = useState([]);
    const [searchingMembers, setSearchingMembers] = useState(false);
    const fileInputRef = useRef(null);
    const searchTimeout = useRef(null);

    const [whoCanSend, setWhoCanSend] = useState(group.permissions?.whoCanSend || "all");
    const [whoCanAdd, setWhoCanAdd] = useState(group.permissions?.whoCanAdd || "all");

    // Slow mode, the member cap, the announcement and the invite code are all
    // server-owned. They are held as drafts and written on demand, never
    // mirrored from props in an effect: an effect that syncs props into state
    // is the classic cascading-render bug, and every write already goes
    // through the same patch.
    const [slowDraft, setSlowDraft] = useState(String(slowModeSeconds));
    const [limitDraft, setLimitDraft] = useState(String(maxMembers));
    const [announceDraft, setAnnounceDraft] = useState(group.announcement?.text || "");
    const [announceBusy, setAnnounceBusy] = useState(false);
    const [generatedInviteCode, setGeneratedInviteCode] = useState("");
    const [inviteBusy, setInviteBusy] = useState(false);
    const [muteBusy, setMuteBusy] = useState(false);
    const [capError, setCapError] = useState("");
    const [slowError, setSlowError] = useState("");

    // Never generated on mount. An existing `inviteCode` is rendered as-is, and
    // a new one is only minted when an admin explicitly asks — so opening this
    // sheet can never invalidate a link that was already shared. A locally
    // generated code wins until the server's own arrives, so a rotated code
    // shows up without a props-to-state sync effect.
    const inviteCode = generatedInviteCode || group.inviteCode || "";

    const inviteLink = useMemo(() => {
        if (!inviteCode || typeof window === "undefined") return "";
        return `${window.location.origin}/inbox?group=${group._id}&invite=${inviteCode}`;
    }, [inviteCode, group._id]);

    /** The one write path. Always reports the server's own words. */
    const patchGroup = useCallback(async (body) => {
        const updated = await callApi(`/api/groups/${group._id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, username: user.username }),
        });
        onGroupUpdated?.(updated);
        return updated;
    }, [group._id, user.username, onGroupUpdated]);

    const runAction = useCallback(async (body, successText) => {
        setSaving(true);
        try {
            await patchGroup(body);
            showToast(successText, "success");
            return true;
        } catch (e) {
            showToast(errText(e), "error");
            return false;
        } finally {
            setSaving(false);
        }
    }, [patchGroup, showToast]);

    const handleAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showToast("Image must be under 5MB", "error");
            return;
        }
        setUploadingAvatar(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("upload_preset", getUploadPreset());
            const res = await fetch(`https://api.cloudinary.com/v1_1/${getCloudName()}/image/upload`, { method: "POST", body: fd });
            const data = await res.json();
            if (data.secure_url) {
                noteUploadedBytes(data.bytes || file.size);
                setAvatarUrl(data.secure_url);
            }
            else showToast(data?.error?.message || "Upload failed", "error");
        } catch {
            showToast("Upload failed", "error");
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleSaveInfo = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            const updated = await patchGroup({
                action: "updateInfo",
                name: name.trim(),
                description: description.trim(),
                avatarUrl,
            });
            showToast("Group updated", "success");
            onGroupUpdated?.(updated);
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setSaving(false);
        }
    };

    const handleSavePermissions = () => runAction(
        { action: "updatePermissions", whoCanSend, whoCanAdd },
        "Permissions updated"
    );

    const handleSearchMember = (query) => {
        setAddMemberQuery(query);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!query.trim()) { setAddMemberResults([]); return; }
        searchTimeout.current = setTimeout(async () => {
            setSearchingMembers(true);
            try {
                const res = await fetch(`/api/users/search?username=${encodeURIComponent(query.trim())}&limit=8`);
                const data = await res.json();
                setAddMemberResults(
                    (data.users || []).filter((u) => !(group.members || []).some((m) => (m.username || m) === u.username))
                );
            } catch {
                setAddMemberResults([]);
            } finally {
                setSearchingMembers(false);
            }
        }, 300);
    };

    const handleAddMember = async (memberUsername) => {
        // Refused locally as well as by the server: the cap is a rule about who
        // gets in, and letting someone compose a search for a full group is a
        // dead end. The server answers 400 for the same reason.
        if (isFull) {
            showToast(`This group is full (${maxMembers} members)`, "error");
            return;
        }
        setSaving(true);
        try {
            await patchGroup({ action: "addMember", memberUsername });
            setAddMemberQuery("");
            setAddMemberResults([]);
            showToast(`${memberUsername} added`, "success");
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setSaving(false);
        }
    };

    // The row for the viewer is not rendered with this control — leaving is
    // the `leave` action, which is the one that runs the auto-promote and
    // delete-the-group bookkeeping. Removing yourself through `removeMember`
    // would skip both, so there is deliberately no path to it here.
    const handleRemoveMember = async (memberUsername) => {
        if (!confirm(`Remove ${memberUsername} from the group?`)) return;
        await runAction({ action: "removeMember", memberUsername }, `${memberUsername} removed`);
    };

    const handlePromoteMember = async (memberUsername) => {
        // This used to post to POST /:id/members with `action: "promote"`. That
        // route destructures only { username, avatarUrl, color } and its whole
        // job is to *add* a member, so for an existing member it answered 400
        // "Already a member" — and the `if (res.ok)` with no else meant the
        // Promote button silently did nothing. The route that actually changes a
        // role is PATCH /:id { action: "updateRole" }.
        await runAction(
            { action: "updateRole", memberUsername, role: "admin" },
            `${memberUsername} promoted to admin`
        );
    };

    // The server had a `demote` action and no UI for it. It refuses the creator
    // and refuses to remove the last admin, with two specific 400s; both are
    // surfaced rather than pre-empted, so the reason is the server's.
    const handleDemoteMember = async (memberUsername) => {
        if (!confirm(
            `Demote ${memberUsername} to a regular member?\n\nThey will lose the ability to edit group info, change permissions, moderate slow mode or the member limit, and post if this group is set to admins only.`
        )) return;
        await runAction({ action: "demote", memberUsername }, `${memberUsername} demoted`);
    };

    const handleSaveSlowMode = async () => {
        const secs = Number(String(slowDraft).trim() || "0");
        if (!Number.isFinite(secs) || secs < 0 || secs > MAX_SLOW_MODE_SECONDS) {
            setSlowError(`Seconds must be between 0 and ${MAX_SLOW_MODE_SECONDS}`);
            return;
        }
        setSlowError("");
        setSaving(true);
        try {
            const updated = await patchGroup({ action: "setSlowMode", seconds: Math.floor(secs) });
            setSlowDraft(String(updated.slowModeSeconds ?? Math.floor(secs)));
            showToast("Slow mode updated", "success");
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveMaxMembers = async () => {
        const max = Number(String(limitDraft).trim() || "0");
        if (!Number.isFinite(max) || max < 0 || max > MAX_LIMIT) {
            setCapError(`The limit must be between 0 and ${MAX_LIMIT}`);
            return;
        }
        setCapError("");
        setSaving(true);
        try {
            const updated = await patchGroup({ action: "setMaxMembers", maxMembers: Math.floor(max) });
            setLimitDraft(String(updated.maxMembers ?? Math.floor(max)));
            showToast("Member limit updated", "success");
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAnnouncement = async (value) => {
        setAnnounceBusy(true);
        try {
            await patchGroup({ action: "announcement", text: String(value).slice(0, MAX_ANNOUNCEMENT) });
            showToast(value.trim() ? "Announcement set" : "Announcement cleared", "success");
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setAnnounceBusy(false);
        }
    };

    // Never generated on mount. An existing `inviteCode` is rendered as-is, and
    // a new one is only minted when an admin explicitly asks — so opening this
    // sheet can never invalidate a link that was already shared.
    const handleGenerateInvite = async () => {
        if (!isAdmin) {
            showToast("Only admins can rotate the invite link", "error");
            return;
        }
        const rotating = !!inviteCode;
        if (rotating && !confirm("Rotate this group's invite link?\n\nThe current link stops working immediately and anyone holding it can no longer join.")) return;
        setInviteBusy(true);
        try {
            const updated = await patchGroup({ action: "regenerateInvite" });
            if (updated?.inviteCode) setGeneratedInviteCode(updated.inviteCode);
            showToast(rotating ? "Invite link rotated" : "Invite link created", "success");
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setInviteBusy(false);
        }
    };

    const handleCopyInvite = async () => {
        const ok = await copyText(inviteLink);
        showToast(ok ? "Invite link copied" : "Could not copy the link", ok ? "success" : "error");
    };

    // `toggleMute` had no client caller and no client reader: the server pushed
    // a username into `mutedBy` and nothing ever displayed it or flipped it.
    // Both halves now exist. The inbox list is not this file, so a window event
    // is emitted as the integration point for its badge.
    const handleMute = async () => {
        if (muteBusy) return;
        setMuteBusy(true);
        try {
            await patchGroup({ action: "toggleMute" });
            window.dispatchEvent(new CustomEvent("groupMuteChanged", {
                detail: { groupId: group._id, username: user.username, muted: !isMuted },
            }));
            showToast(isMuted ? "Group unmuted" : "Group muted", "success");
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setMuteBusy(false);
        }
    };

    const handleLeave = async () => {
        const lastOne = memberCount <= 1;
        const ok = confirm(lastOne
            ? "Leave this group?\n\nYou are the last member, so the group AND every message in it will be deleted for everyone. This cannot be undone."
            : "Leave this group?\n\nYou will stop receiving its messages. If you are the only admin, the server promotes the next member automatically so the group still has someone who can manage it."
        );
        if (!ok) return;
        setSaving(true);
        try {
            await callApi(`/api/groups/${group._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username, action: "leave" }),
            });
            showToast("Left group", "success");
            onLeave?.();
            onClose();
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Delete this group for everyone? Every message in it goes too. This cannot be undone.")) return;
        setSaving(true);
        try {
            await callApi(`/api/groups/${group._id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: user.username }),
            });
            showToast("Group deleted", "success");
            onLeave?.();
            onClose();
        } catch (e) {
            showToast(errText(e), "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            {/* `dvh`, not `vh`: on iOS `vh` is the LARGEST viewport, so `85vh` could
                exceed the visible area. With the header `shrink-0` and the body
                `min-h-0`, `max-h` constrains the sheet itself and a focused input
                shrinks the scroller instead of pushing the Save button off-screen.

                `safe-top` / `safe-bottom` are on the sheet, not on the header and
                the scrolling body: `.safe-*` are unlayered rules in globals.css, so
                they override a same-side `py-*` / `p-5` utility and would leave
                those edges unpadded wherever the inset is 0. On the sheet they just
                inset the whole panel. */}
            <div className="bg-white dark:bg-gray-950 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[85dvh] flex flex-col overflow-hidden safe-top safe-bottom" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
                    <h2 className="font-bold text-lg text-gray-900 dark:text-gray-100">Group Settings</h2>
                    <button onClick={onClose} aria-label="Close"
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center w-11 h-11 -mr-2 shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
                    {/* Notification */}
                    <div className="border-b border-gray-200 dark:border-gray-800 pb-4">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Notifications</h3>
                        <Row
                            label="Mute this group"
                            hint="Keeps the group in your inbox but stops it counting towards the unread badge. The unread badge itself is drawn by the conversation list, not this sheet."
                        >
                            <Toggle label="Mute this group" on={isMuted} onChange={handleMute} disabled={muteBusy} />
                        </Row>
                    </div>

                    {/* Avatar + Info (admin only) */}
                    {isAdmin && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    aria-label="Change group photo"
                                    className="relative w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 transition-colors"
                                >
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-2xl font-bold text-gray-400">{name[0]?.toUpperCase() || "G"}</span>
                                    )}
                                    {uploadingAvatar && (
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    )}
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                                <div className="text-xs text-gray-400">Change photo</div>
                            </div>
                            <input
                                type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 50))}
                                placeholder="Group name"
                                aria-label="Group name"
                                // Form controls are 16px on touch (see RepostButton):
                                // 14px made iOS zoom the page on focus, and the layout
                                // viewport meta in app/layout.js leaves no way to zoom
                                // back out.
                                className={SHEET_INPUT}
                            />
                            <textarea
                                value={description} onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                                placeholder="Description" rows={2} aria-label="Group description"
                                className={`${SHEET_INPUT} resize-none`}
                            />
                            <button onClick={handleSaveInfo} disabled={saving || !name.trim()} className={PRIMARY}>
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    )}

                    {/* Announcement */}
                    <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Announcement</h3>
                        {isAdmin ? (
                            <>
                                <textarea
                                    value={announceDraft}
                                    onChange={(e) => setAnnounceDraft(e.target.value.slice(0, MAX_ANNOUNCEMENT))}
                                    rows={2}
                                    maxLength={MAX_ANNOUNCEMENT}
                                    placeholder="Anything every member should see at the top of this group"
                                    aria-label="Group announcement"
                                    className={`${SHEET_INPUT} resize-none`}
                                />
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => handleSaveAnnouncement(announceDraft)} disabled={announceBusy} className={PRIMARY}>
                                        {announceBusy ? "Saving…" : "Set announcement"}
                                    </button>
                                    <button onClick={() => handleSaveAnnouncement("")} disabled={announceBusy} className={GHOST}>
                                        Clear
                                    </button>
                                </div>
                                {group.announcement?.setBy && (
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                        Last set by {group.announcement.setBy}
                                        {group.announcement.setAt ? ` · ${timeAgo(group.announcement.setAt)}` : ""}
                                    </p>
                                )}
                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                    Only admins can set or clear it. Every member sees the banner, and can dismiss it for their own session.
                                </p>
                            </>
                        ) : group.announcement?.text ? (
                            <div className="rounded-xl px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Group announcement</p>
                                <p className="text-xs text-amber-900 dark:text-amber-100 break-words whitespace-pre-wrap mt-0.5">{group.announcement.text}</p>
                                {group.announcement.setBy && (
                                    <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">Set by {group.announcement.setBy}</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 dark:text-gray-500">No announcement. An admin can set one from here.</p>
                        )}
                    </div>

                    {/* Invite link */}
                    <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Invite link</h3>
                        {inviteCode ? (
                            <>
                                <div className="flex items-center gap-2 min-w-0">
                                    <code className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 break-all">
                                        {inviteLink}
                                    </code>
                                    <button onClick={handleCopyInvite} className={GHOST} aria-label="Copy invite link">
                                        Copy
                                    </button>
                                </div>
                                <Note tone="warn">
                                    Anyone who has this link can join this group without an invitation. Rotating it
                                    invalidates the old link immediately, which is the only way to cut off a leak.
                                </Note>
                            </>
                        ) : (
                            <Note>
                                This group has no invite link yet. Only an admin can generate one, and it is
                                generated only on request — opening this sheet does not create or rotate it.
                            </Note>
                        )}
                        {isAdmin && (
                            <button onClick={handleGenerateInvite} disabled={inviteBusy} className={GHOST}>
                                {inviteBusy ? "Working…" : inviteCode ? "Rotate invite link" : "Generate invite link"}
                            </button>
                        )}
                    </div>

                    {/* Permissions (admin only) */}
                    {isAdmin && (
                        <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-3">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Permissions</h3>
                            <div className="space-y-2">
                                <label className="flex items-center justify-between gap-3 min-w-0">
                                    <span className={`${LABEL} min-w-0`}>Who can send messages</span>
                                    <select value={whoCanSend} onChange={(e) => setWhoCanSend(e.target.value)} className={`${SELECT} shrink-0`}>
                                        <option value="all">Everyone</option>
                                        <option value="admin">Admins only</option>
                                    </select>
                                </label>
                                <label className="flex items-center justify-between gap-3 min-w-0">
                                    <span className={`${LABEL} min-w-0`}>Who can add members</span>
                                    <select value={whoCanAdd} onChange={(e) => setWhoCanAdd(e.target.value)} className={`${SELECT} shrink-0`}>
                                        <option value="all">Everyone</option>
                                        <option value="admin">Admins only</option>
                                    </select>
                                </label>
                            </div>
                            {whoCanSend === "admin" && (
                                <Note>
                                    With this on, the composer is disabled for members and the server refuses their
                                    messages with a 403. Admins are unaffected.
                                </Note>
                            )}
                            <button onClick={handleSavePermissions} disabled={saving} className={PRIMARY}>
                                Save Permissions
                            </button>
                        </div>
                    )}

                    {/* Slow mode + member cap (admin only) */}
                    {isAdmin && (
                        <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Moderation</h3>

                            <Field
                                label="Slow mode (seconds between messages)"
                                hint="0 turns it off. Enforced by the server on every send and it answers 429 with the remaining time, which the composer shows as a live countdown. Admins are exempt so a moderator can still reply."
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={MAX_SLOW_MODE_SECONDS}
                                        value={slowDraft}
                                        onChange={(e) => setSlowDraft(e.target.value)}
                                        aria-label="Slow mode seconds"
                                        className={`${SHEET_INPUT} flex-1 min-w-0`}
                                    />
                                    <button onClick={handleSaveSlowMode} disabled={saving} className={PRIMARY}>Save</button>
                                </div>
                            </Field>
                            {slowError && <p className="text-xs text-red-500 dark:text-red-400">{slowError}</p>}

                            <Field
                                label="Member limit"
                                hint="0 means unlimited. Lowering it below the current size is allowed — the limit governs who gets in, it does not eject anyone. The server refuses new members once it is reached, and the Add control turns off at the same point."
                            >
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={MAX_LIMIT}
                                        value={limitDraft}
                                        onChange={(e) => setLimitDraft(e.target.value)}
                                        aria-label="Member limit"
                                        className={`${SHEET_INPUT} flex-1 min-w-0`}
                                    />
                                    <button onClick={handleSaveMaxMembers} disabled={saving} className={PRIMARY}>Save</button>
                                </div>
                            </Field>
                            {capError && <p className="text-xs text-red-500 dark:text-red-400">{capError}</p>}
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                {maxMembers > 0
                                    ? `${memberCount} / ${maxMembers} members${isFull ? " — the group is full." : ""}`
                                    : `${memberCount} members — no limit set.`}
                            </p>
                        </div>
                    )}

                    {/* Members */}
                    <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Members ({memberCount})
                            </h3>
                            {maxMembers > 0 && (
                                <span className={`text-[11px] tabular-nums ${isFull ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-gray-400 dark:text-gray-500"}`}>
                                    {memberCount} / {maxMembers}
                                </span>
                            )}
                        </div>

                        {isAdmin && (
                            <div>
                                <input
                                    type="text" value={addMemberQuery} onChange={(e) => handleSearchMember(e.target.value)}
                                    placeholder={isFull ? `Group is full (${maxMembers} members)` : "Add a member..."}
                                    disabled={isFull}
                                    aria-label="Add a member"
                                    className={`${SHEET_INPUT} disabled:opacity-50`}
                                />
                                {searchingMembers && (
                                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Searching…</p>
                                )}
                                {!isFull && addMemberResults.length > 0 && (
                                    <div className="mt-1 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-40 overflow-y-auto">
                                        {addMemberResults.map((u) => (
                                            <button key={u.username} onClick={() => handleAddMember(u.username)}
                                                className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
                                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                                    style={{ backgroundColor: u.avatarColor || "#3b82f6" }}>
                                                    {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" /> : u.username[0]?.toUpperCase()}
                                                </div>
                                                <span className="text-xs text-gray-900 dark:text-gray-100 truncate min-w-0">{u.username}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {isFull && (
                                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                                        This group is at its {maxMembers}-member limit. Raise it above to add anyone.
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="space-y-1 max-h-72 overflow-y-auto">
                            {(group.members || []).map((m) => {
                                const mName = m.username || m;
                                const isSelf = mName === user.username;
                                return (
                                    <div key={mName} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                                            style={{ backgroundColor: m._profile?.avatarUrl || m.avatarUrl ? undefined : (m.color || "#3b82f6") }}>
                                            {m._profile?.avatarUrl || m.avatarUrl ? (
                                                <img src={m._profile?.avatarUrl || m.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                                            ) : mName[0]?.toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm text-gray-900 dark:text-gray-100 truncate block">{mName}</span>
                                            {m.role === "admin" && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-medium">admin</span>}
                                            {mName === group.creator && <span className="text-[10px] text-gray-400">(creator)</span>}
                                        </div>
                                        {isAdmin && !isSelf && mName !== group.creator && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                {m.role !== "admin" ? (
                                                    <button onClick={() => handlePromoteMember(mName)} className={`${ROW_BTN} text-blue-500 hover:text-blue-600`}>Promote</button>
                                                ) : (
                                                    // Disabled, not hidden, when this is the
                                                    // only admin left: the server refuses to
                                                    // demote them and says why.
                                                    <button
                                                        onClick={() => handleDemoteMember(mName)}
                                                        disabled={otherAdmins === 0}
                                                        title={otherAdmins === 0 ? "A group must keep at least one admin" : "Demote to member"}
                                                        className={`${ROW_BTN} text-amber-600 hover:text-amber-700`}
                                                    >
                                                        Demote
                                                    </button>
                                                )}
                                                <button onClick={() => handleRemoveMember(mName)} className={`${ROW_BTN} text-red-500 hover:text-red-600`}>Remove</button>
                                            </div>
                                        )}
                                        {isAdmin && mName === group.creator && !isSelf && (
                                            <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500 px-2">
                                                Creator
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Leave / Delete */}
                    <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-2">
                        <button onClick={handleLeave} disabled={saving}
                            className="w-full py-2.5 min-h-[44px] text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors border border-red-200 dark:border-red-800/30 disabled:opacity-50">
                            Leave Group
                        </button>
                        {isAdmin && (
                            <button onClick={handleDelete} disabled={saving}
                                className="w-full py-2.5 min-h-[44px] text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors border border-red-300 dark:border-red-800/50 disabled:opacity-50">
                                Delete Group
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
