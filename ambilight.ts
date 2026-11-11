/*
 * Ambilight — fills the black bars around videos on Discord with a glow
 * that takes its colors from the edges of the video (like youtube-ambilight).
 *
 * This file doesn't depend on Vencord: it only holds the DOM/canvas logic.
 */

export interface AmbilightOptions {
    /** streams and cameras in calls (videos whose srcObject is a MediaStream) */
    callVideos: boolean;
    /** regular videos in messages (attachments, embeds) */
    chatVideos: boolean;
    /** side-by-side streams: each one lights its own part (false = no glow) */
    multiLive: boolean;
    /** blur in px */
    blur: number;
    /** saturation in % (100 = unchanged) */
    saturation: number;
    /** brightness in % (100 = unchanged) */
    brightness: number;
    /** how much of the video edge is stretched into the bars, in % */
    edgeSize: number;
    /** darkening toward the outer edges, in % */
    fade: number;
    /** how much of the previous frame stays visible (smooth transitions), in % */
    smoothing: number;
    /** frames per second of the effect */
    fps: number;
    /** px of blending between the video edge and the glow (0 = sharp edge) */
    feather: number;
}

interface Rect { left: number; top: number; width: number; height: number; }
interface Area extends Rect { right: number; bottom: number; innerLeft: boolean; innerRight: boolean; }

const ATTR = "data-vc-ambilight";
const SCAN_INTERVAL = 500; // ms
const MIN_SIZE = 160; // px: no glow on tiny videos (gifs, previews)
const MIN_BAR = 2; // px: below this there are no bars
const CANVAS_RES = 160; // resolution of the long side of the internal canvas
const MAX_DEPTH = 25; // how many parents to climb to find the bars
const NEIGHBOUR_SIZE = 0.4; // a neighbour at least 40% as wide and tall as the video = another tile / stream
const SIDE_PANEL_MIN = 48; // px: anything beside the video wider than this is a panel (channels, chat)
const TITLE_BAR_MAX = 64; // px: max height of the title bar above the stream
const DARK_LIMIT = 24; // a background below this value (0-255) counts as "black"
const BLEND = 220; // px: band where the glows of two side-by-side streams blend
const MULTI_DIM = 0.85; // with several streams the glow is a bit softer
const FREEZE_EVERY = 250; // ms between copies of the last frame
const FREEZE_MAX_W = 1920; // px: max width of the copy
const FREEZE_KEEP = 5000; // ms: how long a stalled stream keeps showing its last frame

function contentRect(video: HTMLVideoElement, box: DOMRect, fit: string): Rect {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh || (fit !== "contain" && fit !== "scale-down"))
        return { left: box.left, top: box.top, width: box.width, height: box.height };

    let scale = Math.min(box.width / vw, box.height / vh);
    if (fit === "scale-down") scale = Math.min(scale, 1);
    const width = vw * scale, height = vh * scale;
    return {
        left: box.left + (box.width - width) / 2,
        top: box.top + (box.height - height) / 2,
        width,
        height
    };
}

function hasBars(outer: Rect, inner: Rect) {
    return inner.left - outer.left > MIN_BAR
        || inner.top - outer.top > MIN_BAR
        || (outer.left + outer.width) - (inner.left + inner.width) > MIN_BAR
        || (outer.top + outer.height) - (inner.top + inner.height) > MIN_BAR;
}

/** "big" videos (comparable to ours) inside a container: small previews don't count */
function mainVideos(el: Element, content: Rect) {
    const list: HTMLVideoElement[] = [];
    for (const v of el.querySelectorAll("video")) {
        const r = v.getBoundingClientRect();
        if (r.width >= content.width * NEIGHBOUR_SIZE && r.height >= content.height * NEIGHBOUR_SIZE) list.push(v);
    }
    return list;
}

function parseColor(c: string) {
    const m = c.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    return { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 };
}

/** solid, non-black background: Discord's UI (chat, channels), not the stream's backdrop */
function isChromeBackground(el: Element) {
    const c = parseColor(getComputedStyle(el).backgroundColor);
    return !!c && c.a > 0.5 && Math.max(c.r, c.g, c.b) > DARK_LIMIT;
}

function isOpaqueBlack(el: Element) {
    const c = parseColor(getComputedStyle(el).backgroundColor);
    return !!c && c.a > 0.5 && Math.max(c.r, c.g, c.b) <= DARK_LIMIT;
}

interface Found {
    /** the black area to light up (horizontally the glow stays inside it) */
    target: HTMLElement;
    /** where the glow is inserted */
    host: HTMLElement;
    /** thin bar above the target (window title): the glow reaches up to it */
    topRef: HTMLElement | null;
    /** several side-by-side streams in the same area: each one lights its column */
    group: boolean;
}

/**
 * Finds the black area to light up: the outermost container still inside the
 * stream's backdrop (including the bands above/below with the title and avatars),
 * stopping before Discord's UI (channel list, chat) and before grids.
 * With multiLive, other side-by-side streams don't stop the search: the area is split.
 */
function findTarget(video: HTMLVideoElement, multiLive: boolean): Found | null {
    const box = video.getBoundingClientRect();
    if (box.width < MIN_SIZE || box.height < MIN_SIZE / 2) return null;

    const content = contentRect(video, box, getComputedStyle(video).objectFit);
    let best: HTMLElement | null = hasBars(box, content) ? video : null;
    let blackRect: DOMRect | null = isOpaqueBlack(video) && best ? box : null;
    let group = false;
    // elements holding another stream: with multiLive they are "mates", not obstacles
    const isMate = (s: Element) => multiLive && mainVideos(s, content).length > 0;

    let child: HTMLElement = video;
    let el = video.parentElement;
    for (let i = 0; el && el !== document.body && i < MAX_DEPTH; i++, child = el, el = el.parentElement) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;

        // past the stream's black backdrop, a bigger container is already Discord's UI
        if (blackRect && (r.width > blackRect.width + 2 || r.height > blackRect.height + 2)) break;

        const mains = mainVideos(el, content);
        if (mains.length > 1) {
            if (!multiLive) break;
            // streams must sit next to each other (not on top of each other)
            const stacked = mains.some(v => {
                if (v === video) return false;
                const vr = v.getBoundingClientRect();
                return vr.left < box.right - 1 && vr.right > box.left + 1;
            });
            if (stacked) break;
            group = true;
        }
        // other tiles or panels beside it (grid, channel list, chat): stop
        if (hasNeighbourTiles(el, child, content, isMate) || hasSidePanel(el, child, isMate)) break;

        const bars = hasBars(r, content);
        if (bars && isChromeBackground(el)) break;
        if (bars) {
            best = el;
            if (isOpaqueBlack(el)) blackRect = r;
        }
    }
    if (!best) return null;
    // a group needs a shared container bigger than a single video
    if (group && (best === video || mainVideos(best, content).length < 2)) group = false;

    const host = best === video ? video.parentElement! : best;
    if (best === video) return { target: best, host, topRef: null, group };

    // title bar right above (the server name at the top): the glow reaches it too,
    // but only above the stream's column
    const tr = best.getBoundingClientRect();
    let p: HTMLElement = best;
    let a = best.parentElement;
    for (let i = 0; a && a !== document.body && i < 4; i++, p = a, a = a.parentElement) {
        if (isChromeBackground(a)) break;
        for (const s of a.children) {
            if (s === p || !(s instanceof HTMLElement) || s.hasAttribute(ATTR)) continue;
            const sr = s.getBoundingClientRect();
            const isBarAbove = sr.height >= 8 && sr.height <= TITLE_BAR_MAX
                && Math.abs(sr.bottom - tr.top) <= 4
                && sr.left <= tr.left + 2 && sr.right >= tr.right - 2;
            if (isBarAbove && !isChromeBackground(s)) return { target: best, host: a, topRef: s, group };
        }
    }
    return { target: best, host, topRef: null, group };
}

/**
 * true if `el` holds another big element that does NOT overlap the branch with the
 * video: it's another tile of the grid (a person or a stream).
 * Overlays on top of the video (name, borders, buttons) overlap it and are ignored;
 * the row of avatars under a focused stream is too short to count.
 */
function hasNeighbourTiles(el: HTMLElement, child: HTMLElement, content: Rect, skip: (s: Element) => boolean) {
    const c = child.getBoundingClientRect();
    for (const s of el.children) {
        if (s === child || !(s instanceof HTMLElement) || s.hasAttribute(ATTR)) continue;
        const r = s.getBoundingClientRect();
        if (r.width < content.width * NEIGHBOUR_SIZE || r.height < content.height * NEIGHBOUR_SIZE) continue;
        const overlaps = r.left < c.right - 1 && r.right > c.left + 1 && r.top < c.bottom - 1 && r.bottom > c.top + 1;
        if (!overlaps && !skip(s)) return true;
    }
    return false;
}

/** is there an element beside (left or right of) the branch with the video? */
function hasSidePanel(el: HTMLElement, child: HTMLElement, skip: (s: Element) => boolean) {
    const c = child.getBoundingClientRect();
    for (const s of el.children) {
        if (s === child || !(s instanceof HTMLElement) || s.hasAttribute(ATTR)) continue;
        const r = s.getBoundingClientRect();
        if (r.width < SIDE_PANEL_MIN || r.height < 1) continue;
        const besideX = r.right <= c.left + 1 || r.left >= c.right - 1;
        const overlapY = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
        if (besideX && overlapY > Math.min(r.height, c.height) * 0.5 && !skip(s)) return true;
    }
    return false;
}

/** fades the video edges (only on sides with bars) so it blends into the glow */
function featherMask(video: HTMLVideoElement, cr: Rect, bars: { L: number, R: number, T: number, B: number; }, feather: number) {
    if (feather <= 0) return "none";
    const vb = video.getBoundingClientRect();
    const f = Math.min(feather, cr.width / 4, cr.height / 4);
    const l = cr.left - vb.left, t = cr.top - vb.top;
    const r = l + cr.width, b = t + cr.height;
    const layers: string[] = [];
    if (bars.L > MIN_BAR || bars.R > MIN_BAR) {
        const fl = bars.L > MIN_BAR ? f : 0, fr = bars.R > MIN_BAR ? f : 0;
        layers.push(`linear-gradient(to right, transparent ${l}px, #000 ${l + fl}px, #000 ${r - fr}px, transparent ${r}px)`);
    }
    if (bars.T > MIN_BAR || bars.B > MIN_BAR) {
        const ft = bars.T > MIN_BAR ? f : 0, fb = bars.B > MIN_BAR ? f : 0;
        layers.push(`linear-gradient(to bottom, transparent ${t}px, #000 ${t + ft}px, #000 ${b - fb}px, transparent ${b}px)`);
    }
    return layers.join(", ") || "none";
}

type Restore = () => void;

function setStyle(el: HTMLElement, prop: string, value: string, restore: Restore[]) {
    const old = el.style.getPropertyValue(prop);
    const oldPrio = el.style.getPropertyPriority(prop);
    el.style.setProperty(prop, value, "important");
    restore.push(() => {
        if (old) el.style.setProperty(prop, old, oldPrio);
        else el.style.removeProperty(prop);
    });
}

function setMaskOn(el: HTMLElement, mask: string) {
    el.style.setProperty("mask-image", mask, "important");
    el.style.setProperty("-webkit-mask-image", mask, "important");
}

class Instance {
    readonly wrapper = document.createElement("div");
    readonly canvas = document.createElement("canvas");
    readonly overlay = document.createElement("div");
    /**
     * Sharp copy of the last frame, always ready under the video (which covers it).
     * If Discord stops drawing the video, this stays visible instead of an empty hole.
     */
    readonly freeze = document.createElement("canvas");
    readonly ctx: CanvasRenderingContext2D;
    readonly freezeCtx: CanvasRenderingContext2D;
    readonly target: HTMLElement;
    readonly topRef: HTMLElement | null;
    readonly group: boolean;
    private restore: Restore[] = [];
    private host: HTMLElement;
    private fresh = true;
    private lastTime = -1;
    private lastWrap = "";
    private lastCanvas = "";
    private lastOverlay = "";
    private lastFilter = "";
    private lastMask = "none";
    private lastWrapMask = "";
    private lastFreezeBox = "";
    private noBarsSince = 0;
    private hasFreeze = false;
    private lastFreezeAt = 0;
    private notReadySince = 0;

    constructor(readonly video: HTMLVideoElement, found: Found) {
        this.ctx = this.canvas.getContext("2d", { alpha: false })!;
        this.freezeCtx = this.freeze.getContext("2d", { alpha: false })!;
        this.target = found.target;
        this.topRef = found.topRef;
        this.host = found.host;
        this.group = found.group;
        const { target } = this;

        // The wrapper is a positioned child of the host, with no z-index and no new
        // stacking context: it covers the black backgrounds but stays under everything that
        // comes after it (video, names, buttons) and doesn't change how Discord stacks things.
        const hostStyle = getComputedStyle(this.host);
        if (hostStyle.position === "static") setStyle(this.host, "position", "relative", this.restore);

        // everything in the host (video, title, avatars) must stay above the wrapper:
        // non-positioned children would be painted below it, so they get position: relative
        for (const c of this.host.children)
            if (c instanceof HTMLElement && !c.hasAttribute(ATTR) && getComputedStyle(c).position === "static")
                setStyle(c, "position", "relative", this.restore);

        // everything between the host and the video (video included) becomes transparent,
        // so the glow, not black, shows under the faded edges of the video
        for (let el: HTMLElement | null = video; el && el !== this.host; el = el.parentElement) {
            setStyle(el, "background", "transparent", this.restore);
            // borders of the containers around the stream (like the line under the title bar)
            // would cut through the glow: they become invisible
            if (el !== video) {
                const s = getComputedStyle(el);
                for (const side of ["top", "right", "bottom", "left"] as const)
                    if (parseFloat(s.getPropertyValue(`border-${side}-width`)))
                        setStyle(el, `border-${side}-color`, "transparent", this.restore);
            }
        }

        setStyle(video, "mask-image", "none", this.restore);
        setStyle(video, "-webkit-mask-image", "none", this.restore);
        setStyle(video, "mask-composite", "intersect", this.restore);
        setStyle(video, "-webkit-mask-composite", "source-in", this.restore);

        this.wrapper.setAttribute(ATTR, "");
        Object.assign(this.wrapper.style, {
            position: "absolute",
            pointerEvents: "none",
            overflow: "hidden",
            contain: "strict",
            borderRadius: this.group ? "" : getComputedStyle(target).borderRadius
        });
        Object.assign(this.canvas.style, { position: "absolute", display: "block" });
        Object.assign(this.overlay.style, { position: "absolute", inset: "0" });
        Object.assign(this.freeze.style, { position: "absolute", display: "none" });
        this.freeze.style.setProperty("mask-composite", "intersect");
        this.freeze.style.setProperty("-webkit-mask-composite", "source-in");
        this.wrapper.append(this.canvas, this.overlay, this.freeze);
        this.host.prepend(this.wrapper);
    }

    get alive() {
        return this.video.isConnected && this.wrapper.isConnected && this.target.isConnected
            && (this.target === this.video || this.target.contains(this.video))
            && (!this.topRef || this.topRef.isConnected);
    }

    get hostEl() { return this.host; }

    /** tells whether the layout changed compared to a new findTarget */
    sameAs(f: Found) {
        return f.target === this.target && f.host === this.host && f.topRef === this.topRef && f.group === this.group;
    }

    /** horizontal position of the video, to sort side-by-side streams */
    get centerX() {
        const r = this.video.getBoundingClientRect();
        return r.left + r.width / 2;
    }

    /**
     * Area to light up: the target, stretched up to the title bar.
     * With side-by-side streams, each stream takes its own column (up to halfway
     * to its neighbour) plus a blending band.
     */
    private area(cr: Rect): Area {
        const t = this.target.getBoundingClientRect();
        const top = this.topRef ? Math.min(t.top, this.topRef.getBoundingClientRect().top) : t.top;
        let left = t.left, right = t.right, innerLeft = false, innerRight = false;

        if (this.group) {
            let leftEdge = -Infinity, rightEdge = Infinity;
            for (const v of mainVideos(this.target, cr)) {
                if (v === this.video) continue;
                const o = contentRect(v, v.getBoundingClientRect(), getComputedStyle(v).objectFit);
                if (o.left + o.width <= cr.left + 1) leftEdge = Math.max(leftEdge, o.left + o.width);
                else if (o.left >= cr.left + cr.width - 1) rightEdge = Math.min(rightEdge, o.left);
            }
            if (leftEdge > -Infinity) {
                left = Math.max(t.left, (leftEdge + cr.left) / 2 - BLEND / 2);
                innerLeft = true;
            }
            if (rightEdge < Infinity) {
                right = Math.min(t.right, (cr.left + cr.width + rightEdge) / 2 + BLEND / 2);
                innerRight = true;
            }
        }
        return {
            left, top, right, bottom: t.bottom,
            width: right - left, height: t.bottom - top,
            innerLeft, innerRight
        };
    }

    private snapshot() {
        const { video } = this;
        const vw = video.videoWidth, vh = video.videoHeight;
        if (!vw || !vh) return;
        const w = Math.min(vw, FREEZE_MAX_W), h = Math.round(vh * w / vw);
        if (this.freeze.width !== w || this.freeze.height !== h) {
            this.freeze.width = w;
            this.freeze.height = h;
        }
        try {
            this.freezeCtx.drawImage(video, 0, 0, w, h);
            this.hasFreeze = true;
        } catch {
            // frame not available
        }
    }

    /** returns false when the instance has had no bars for a while and should be removed */
    draw(o: AmbilightOptions, now: number): boolean {
        const { video } = this;
        const vb = video.getBoundingClientRect();
        const fit = getComputedStyle(video).objectFit;
        const cr = contentRect(video, vb, fit);
        const tr = this.area(cr);

        // off screen: nothing to do
        if (tr.bottom < 0 || tr.right < 0 || tr.top > innerHeight || tr.left > innerWidth) return true;

        // paused or empty stream: keep the glow and the last frame stays visible
        const ready = video.videoWidth > 0 && video.readyState >= 2;
        if (!ready) {
            if (!this.notReadySince) this.notReadySince = now;
            if (this.hasFreeze && now - this.notReadySince < FREEZE_KEEP && this.wrapper.style.display !== "none")
                return true;
        } else {
            this.notReadySince = 0;
        }

        if (!ready || !hasBars(tr, cr) || tr.width < MIN_SIZE) {
            this.wrapper.style.display = "none";
            this.freeze.style.display = "none";
            this.hasFreeze = false;
            this.setMask("none");
            this.fresh = true;
            if (!this.noBarsSince) this.noBarsSince = now;
            return now - this.noBarsSince < 3000;
        }
        this.noBarsSince = 0;
        this.wrapper.style.display = "";

        // wrapper position inside the host
        const hr = this.host.getBoundingClientRect();
        const x = tr.left - hr.left - this.host.clientLeft;
        const y = tr.top - hr.top - this.host.clientTop;
        const wrap = `${x},${y},${tr.width},${tr.height}`;
        if (wrap !== this.lastWrap) {
            this.lastWrap = wrap;
            Object.assign(this.wrapper.style, {
                left: x + "px", top: y + "px", width: tr.width + "px", height: tr.height + "px"
            });
        }

        // with a stream on the left, this glow fades in on top of its neighbour's
        const wrapMask = tr.innerLeft ? `linear-gradient(to right, transparent 0px, #000 ${BLEND}px)` : "none";
        if (wrapMask !== this.lastWrapMask) setMaskOn(this.wrapper, this.lastWrapMask = wrapMask);

        // the canvas overflows by a margin so the blur doesn't darken the edges
        const m = Math.ceil(o.blur * 2);
        const ew = tr.width + 2 * m, eh = tr.height + 2 * m;
        const cw = ew >= eh ? CANVAS_RES : Math.max(8, Math.round(CANVAS_RES * ew / eh));
        const ch = ew >= eh ? Math.max(8, Math.round(CANVAS_RES * eh / ew)) : CANVAS_RES;
        const cKey = `${m},${ew},${eh},${cw},${ch}`;
        if (cKey !== this.lastCanvas) {
            this.lastCanvas = cKey;
            this.canvas.width = cw;
            this.canvas.height = ch;
            Object.assign(this.canvas.style, {
                left: -m + "px", top: -m + "px", width: ew + "px", height: eh + "px"
            });
            this.fresh = true;
        }

        const bright = this.group ? o.brightness * MULTI_DIM : o.brightness;
        const filter = `blur(${o.blur}px) saturate(${o.saturation}%) brightness(${bright}%)`;
        if (filter !== this.lastFilter) this.canvas.style.filter = this.lastFilter = filter;

        // bars in screen px
        const L = cr.left - tr.left, T = cr.top - tr.top;
        const R = tr.left + tr.width - (cr.left + cr.width);
        const B = tr.top + tr.height - (cr.top + cr.height);

        // darken only toward the outer edges of the area (not between two streams)
        const f = Math.max(0, Math.min(1, o.fade / 100));
        const grads: string[] = [];
        if (f > 0) {
            const c = `rgba(0,0,0,${f})`;
            if (L > MIN_BAR && !tr.innerLeft) grads.push(`linear-gradient(to right, ${c} 0px, transparent ${L}px)`);
            if (R > MIN_BAR && !tr.innerRight) grads.push(`linear-gradient(to left, ${c} 0px, transparent ${R}px)`);
            if (T > MIN_BAR) grads.push(`linear-gradient(to bottom, ${c} 0px, transparent ${T}px)`);
            if (B > MIN_BAR) grads.push(`linear-gradient(to top, ${c} 0px, transparent ${B}px)`);
        }
        const ov = grads.join(",") || "none";
        if (ov !== this.lastOverlay) this.overlay.style.background = this.lastOverlay = ov;

        this.setMask(featherMask(video, cr, { L, R, T, B }, o.feather));

        // copy of the last frame: exactly under the video content, cut away where the
        // video is faded (the glow must show there, not a slightly older copy)
        const fz = o.feather > 0 ? Math.min(o.feather, cr.width / 4, cr.height / 4) : 0;
        const cut = (bar: number) => (bar > MIN_BAR ? fz : 0);
        const fb = `${cr.left - tr.left},${cr.top - tr.top},${cr.width},${cr.height},${cut(T)},${cut(R)},${cut(B)},${cut(L)}`;
        if (fb !== this.lastFreezeBox) {
            this.lastFreezeBox = fb;
            Object.assign(this.freeze.style, {
                left: cr.left - tr.left + "px", top: cr.top - tr.top + "px",
                width: cr.width + "px", height: cr.height + "px"
            });
            // transparent where the video is faded, then fades in where the video is solid
            const w = cr.width, h = cr.height;
            const ramp = (a: number, b: number, size: number, dir: string) =>
                `linear-gradient(${dir}, transparent ${a}px, #000 ${a * 2}px, #000 ${size - b * 2}px, transparent ${size - b}px)`;
            const mask = [ramp(cut(L), cut(R), w, "to right"), ramp(cut(T), cut(B), h, "to bottom")].join(", ");
            setMaskOn(this.freeze, mask);
        }
        if (now - this.lastFreezeAt > FREEZE_EVERY) {
            this.lastFreezeAt = now;
            this.snapshot();
            if (this.hasFreeze && this.freeze.style.display !== "block") this.freeze.style.display = "block";
        }

        // paused video already drawn: nothing to update
        if (!this.fresh && video.paused && video.currentTime === this.lastTime) return true;
        this.lastTime = video.currentTime;

        // content coordinates inside the canvas
        const sx = cw / ew, sy = ch / eh;
        const cx = (L + m) * sx, cy = (T + m) * sy;
        const cW = cr.width * sx, cH = cr.height * sy;
        const vw = video.videoWidth, vh = video.videoHeight;
        const e = Math.max(0.005, Math.min(0.5, o.edgeSize / 100));

        const ctx = this.ctx;
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = this.fresh ? 1 : Math.max(0.05, 1 - o.smoothing / 100);
        try {
            // base: the whole video stretched (fills the corners too)
            ctx.drawImage(video, 0, 0, vw, vh, 0, 0, cw, ch);
            // bars: stretch the matching edge strip
            if (L > MIN_BAR) ctx.drawImage(video, 0, 0, vw * e, vh, 0, cy, cx, cH);
            if (R > MIN_BAR) ctx.drawImage(video, vw * (1 - e), 0, vw * e, vh, cx + cW, cy, cw - cx - cW, cH);
            if (T > MIN_BAR) ctx.drawImage(video, 0, 0, vw, vh * e, cx, 0, cW, cy);
            if (B > MIN_BAR) ctx.drawImage(video, 0, vh * (1 - e), vw, vh * e, cx, cy + cH, cW, ch - cy - cH);
            // center (covered by the video, only a source for the blur)
            ctx.drawImage(video, cx, cy, cW, cH);
            this.fresh = false;
        } catch {
            // frame not available yet
        }
        return true;
    }

    private setMask(mask: string) {
        if (mask === this.lastMask) return;
        this.lastMask = mask;
        setMaskOn(this.video, mask);
    }

    destroy() {
        this.wrapper.remove();
        for (const r of this.restore.reverse()) r();
        this.restore = [];
    }
}

export class AmbilightController {
    private videos = new Set<HTMLVideoElement>();
    private instances = new Map<HTMLVideoElement, Instance>();
    private observer: MutationObserver | null = null;
    private raf = 0;
    private lastDraw = 0;
    private lastScan = 0;

    constructor(private readonly getOptions: () => AmbilightOptions) { }

    /** true while at least one stream has the glow on */
    get active() {
        return this.instances.size > 0;
    }

    start() {
        if (this.observer) return;
        this.observer = new MutationObserver(muts => {
            for (const m of muts)
                for (const n of m.addedNodes) {
                    if (!(n instanceof HTMLElement)) continue;
                    if (n instanceof HTMLVideoElement) this.videos.add(n);
                    else if (n.firstElementChild) n.querySelectorAll("video").forEach(v => this.videos.add(v));
                }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        document.querySelectorAll("video").forEach(v => this.videos.add(v));
        this.raf = requestAnimationFrame(this.loop);
    }

    stop() {
        this.observer?.disconnect();
        this.observer = null;
        cancelAnimationFrame(this.raf);
        for (const inst of this.instances.values()) inst.destroy();
        this.instances.clear();
        this.videos.clear();
    }

    private eligible(v: HTMLVideoElement, o: AmbilightOptions) {
        if (v.closest(`[${ATTR}]`)) return false;
        const isStream = typeof MediaStream !== "undefined" && v.srcObject instanceof MediaStream;
        return isStream ? o.callVideos : o.chatVideos && !!(v.currentSrc || v.src);
    }

    private scan(o: AmbilightOptions) {
        for (const v of this.videos) {
            if (!v.isConnected) {
                this.videos.delete(v);
                this.instances.get(v)?.destroy();
                this.instances.delete(v);
                continue;
            }

            const inst = this.instances.get(v);
            // paused stream (empty video): keep the instance so the last frame stays
            if (inst && inst.alive && v.readyState < 2) continue;

            const ok = this.eligible(v, o) && v.videoWidth > 0;
            // the layout can change (focus <-> grid): check the container again
            const found = ok ? findTarget(v, o.multiLive) : null;
            if (inst && (!found || !inst.sameAs(found) || !inst.alive)) {
                inst.destroy();
                this.instances.delete(v);
            }
            if (found && !this.instances.has(v)) this.instances.set(v, new Instance(v, found));
        }
        this.orderGroups();
    }

    /**
     * Side-by-side streams in the same host: the right glow must sit above the left one,
     * so its fade-in blends the two colors.
     */
    private orderGroups() {
        const byHost = new Map<HTMLElement, Instance[]>();
        for (const inst of this.instances.values()) {
            if (!inst.group) continue;
            const list = byHost.get(inst.hostEl) ?? [];
            list.push(inst);
            byHost.set(inst.hostEl, list);
        }
        for (const [host, list] of byHost) {
            if (list.length < 2) continue;
            list.sort((a, b) => a.centerX - b.centerX);
            const current = [...host.children].filter(c => c.hasAttribute(ATTR));
            if (list.every((inst, i) => current[i] === inst.wrapper)) continue;
            for (let i = list.length - 1; i >= 0; i--) host.prepend(list[i].wrapper);
        }
    }

    private loop = (now: number) => {
        this.raf = requestAnimationFrame(this.loop);
        const o = this.getOptions();

        if (now - this.lastScan > SCAN_INTERVAL) {
            this.lastScan = now;
            this.scan(o);
        }

        if (now - this.lastDraw < 1000 / Math.max(1, o.fps) - 2) return;
        this.lastDraw = now;

        for (const [v, inst] of this.instances) {
            if (!inst.alive || !inst.draw(o, now)) {
                // recreated on the next scan if needed again
                inst.destroy();
                this.instances.delete(v);
            }
        }
    };
}
