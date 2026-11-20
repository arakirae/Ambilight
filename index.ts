/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 ARA
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { relaunch } from "@utils/native";
import definePlugin, { OptionType, PluginNative } from "@utils/types";

import { AmbilightController } from "./ambilight";

// Raising this number on the main branch is what publishes an update:
// every installed copy sees it there and installs that version by itself.
const VERSION = "1.1.0";
const PAGE = "https://github.com/arakirae/Ambilight";

const FIRST_CHECK_MS = 60_000; // once Discord has settled, and after Vencord's own update check
const CHECK_EVERY_MS = 6 * 60 * 60_000;
const RETRY_MS = 5 * 60_000; // when GitHub can't be reached, for example because the PC has just started
const MAX_RETRIES = 3;
/** A version that fails to install is tried this many times, then left to the install command */
const MAX_TRIES = 2;
const FAILED_KEY = "Ambilight_failedUpdate";

const logger = new Logger("Ambilight");

const advanced = () => !settings.store.showAdvanced;

const settings = definePluginSettings({
    callVideos: {
        type: OptionType.BOOLEAN,
        displayName: "Streams and cameras",
        description: "Adds the glow to Go Live streams and cameras in voice calls.",
        default: true
    },
    chatVideos: {
        type: OptionType.BOOLEAN,
        displayName: "Videos in chat",
        description: "Also adds the glow to videos in messages: inside the video's own frame, and around it when you watch it in fullscreen.",
        default: false
    },
    multiLive: {
        type: OptionType.BOOLEAN,
        displayName: "Side-by-side streams",
        description: "When you watch several streams next to each other, each one lights its own part of the screen, blending in the middle. When off, there is no glow in this layout.",
        default: true
    },
    autoUpdate: {
        type: OptionType.BOOLEAN,
        displayName: "Automatic updates",
        description: `Looks for a new version on GitHub and installs it by itself, then asks you to restart Discord. You have version ${VERSION}.`,
        default: true,
        onChange: (on: boolean) => {
            if (on) void checkForUpdate();
        }
    },
    showAdvanced: {
        type: OptionType.BOOLEAN,
        displayName: "Advanced settings",
        description: "Shows the fine-tuning options: blur, colors, blending and performance.",
        default: false
    },
    blur: {
        type: OptionType.SLIDER,
        displayName: "Blur",
        description: "How soft the glow is, in pixels. Higher values give a more diffuse light.",
        markers: [0, 20, 40, 60, 80, 100, 120],
        default: 60,
        stickToMarkers: false,
        hidden: advanced
    },
    saturation: {
        type: OptionType.SLIDER,
        displayName: "Saturation",
        description: "Color intensity of the glow. 100% keeps the original colors.",
        markers: [50, 100, 150, 200, 250],
        default: 140,
        stickToMarkers: false,
        hidden: advanced
    },
    brightness: {
        type: OptionType.SLIDER,
        displayName: "Brightness",
        description: "Brightness of the glow. 100% keeps the original brightness.",
        markers: [25, 50, 75, 100, 125, 150],
        default: 110,
        stickToMarkers: false,
        hidden: advanced
    },
    feather: {
        type: OptionType.SLIDER,
        displayName: "Video edge blending",
        description: "Width, in pixels, of the blend between the edge of the video and the glow. 0 keeps a sharp edge.",
        markers: [0, 25, 50, 75, 100, 150],
        default: 35,
        stickToMarkers: false,
        hidden: advanced
    },
    edgeSize: {
        type: OptionType.SLIDER,
        displayName: "Sampling area",
        description: "How much of the video edge, in percent, gives the colors of the bars. Higher values give steadier, smoother colors.",
        markers: [1, 5, 10, 15, 20, 25],
        default: 12,
        stickToMarkers: false,
        hidden: advanced
    },
    fade: {
        type: OptionType.SLIDER,
        displayName: "Fade to black",
        description: "How much the glow darkens toward the outer edges of the screen.",
        markers: [0, 25, 50, 75, 100],
        default: 20,
        stickToMarkers: false,
        hidden: advanced
    },
    smoothing: {
        type: OptionType.SLIDER,
        displayName: "Transition smoothness",
        description: "How slowly the glow follows color changes. Higher values prevent flicker.",
        markers: [0, 25, 50, 75, 90],
        default: 60,
        stickToMarkers: false,
        hidden: advanced
    },
    fps: {
        type: OptionType.SLIDER,
        displayName: "Updates per second",
        description: "How often the glow is updated. Lower values use less CPU and GPU.",
        markers: [10, 15, 20, 30, 45, 60],
        default: 30,
        stickToMarkers: true,
        hidden: advanced
    }
});

const controller = new AmbilightController(() => settings.store);

// ---------- updates ----------

type FailedUpdate = { version: string; tries: number; };

let firstCheck: ReturnType<typeof setTimeout> | null = null;
let laterChecks: ReturnType<typeof setInterval> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let retries = 0;
let started = false;
let checking = false;
let settled = false;
/** The version installed since Discord started: it runs after the next restart */
let installed: string | null = null;

// The part of the plugin that runs in Discord's main process (native.ts)
function getNative() {
    return VencordNative?.pluginHelpers?.Ambilight as PluginNative<typeof import("./native")> | undefined;
}

function isNewer(latest: string, current: string) {
    const a = latest.split(".").map(Number);
    const b = current.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
    }
    return false;
}

/** GitHub couldn't be reached: a few more tries, some minutes apart, before waiting for the next regular check */
function retryLater() {
    if (!started || retry || retries >= MAX_RETRIES) return;
    retries++;
    retry = setTimeout(() => {
        retry = null;
        void checkForUpdate();
    }, RETRY_MS);
}

/** The same rebuild Vencord runs when it updates itself */
async function rebuild() {
    try {
        const res = await VencordNative.updater.rebuild();
        if (res.ok && res.value) return true;
        logger.error("Vencord couldn't rebuild:", res.ok ? "the build failed" : res.error);
    } catch (err) {
        logger.error("Vencord couldn't rebuild:", err);
    }
    return false;
}

/** Counts the failed try. After the last one, says how to get the version by hand */
async function countFailure(version: string, failed: FailedUpdate | undefined) {
    const tries = failed?.version === version ? failed.tries + 1 : 1;
    await DataStore.set(FAILED_KEY, { version, tries } satisfies FailedUpdate).catch(() => { });
    if (tries < MAX_TRIES) return;

    showNotification({
        title: "Ambilight",
        body: `Version ${version} is out, but it couldn't be installed automatically. Click here to open the page with the install command.`,
        permanent: true,
        onClick: () => void VencordNative.native.openExternal(`${PAGE}#installation`)
    });
}

async function checkForUpdate() {
    // Not in the browser, and not where Vencord's own updater was turned off on purpose
    if (IS_WEB || IS_UPDATER_DISABLED) return;
    if (!started || checking || !settings.store.autoUpdate) return;
    const native = getNative();
    if (!native?.downloadUpdate) return;

    checking = true;
    try {
        // Once per start: an update that Discord was closed in the middle of is tidied up first
        if (!settled) {
            const tidy = await native.settleUpdate(VERSION);
            if (tidy.ok && tidy.restored) logger.info("An update was cut short last time: put the previous files back");
            settled = true;
        }

        const check = await native.getLatestVersion();
        if (!check.ok) {
            logger.info("Couldn't look for updates:", check.error);
            return retryLater();
        }
        const latest = check.version;
        if (!latest || !isNewer(latest, VERSION)) {
            retries = 0;
            return void logger.info(`Version ${VERSION} is up to date`);
        }
        if (latest === installed) return;

        const failed = await DataStore.get<FailedUpdate>(FAILED_KEY).catch(() => undefined);
        if (failed?.version === latest && failed.tries >= MAX_TRIES)
            return void logger.info(`Version ${latest} is out, but it couldn't be installed automatically: use the install command on ${PAGE}`);

        logger.info(`Version ${latest} is out (this is ${VERSION}): installing it`);
        const download = await native.downloadUpdate(latest, VERSION);
        if (!download.ok) {
            logger.warn("Couldn't get the update:", download.error);
            // "download" means GitHub didn't answer and nothing was touched, so it is simply tried again
            if (download.stage === "install") await countFailure(latest, failed);
            else retryLater();
            return;
        }

        if (await rebuild()) {
            installed = latest;
            retries = 0;
            logger.info(`Version ${latest} is installed: it runs after Discord restarts`);
            showNotification({
                title: "Ambilight has been updated!",
                body: `Version ${latest} is installed. Click here to restart Discord.`,
                permanent: true,
                noPersist: true,
                onClick: relaunch
            });
            // Only tidying up from here on: the update itself is done
            await native.confirmUpdate().catch(() => { });
            await DataStore.del(FAILED_KEY).catch(() => { });
            return;
        }

        // The old files go back and Vencord is rebuilt with them, so nothing is left half updated
        await native.rollbackUpdate();
        await rebuild();
        await countFailure(latest, failed);
    } catch (err) {
        logger.error("The update failed:", err);
    } finally {
        checking = false;
    }
}

export default definePlugin({
    name: "Ambilight",
    description: "Fills the black bars around streams, cameras and videos with a glow that takes its colors from the edges of the video, in any aspect ratio.",
    authors: [{ name: "ARA", id: 0n }],
    settings,

    version: VERSION,
    checkForUpdate,

    start() {
        controller.start();
        started = true;
        firstCheck = setTimeout(checkForUpdate, FIRST_CHECK_MS);
        laterChecks = setInterval(checkForUpdate, CHECK_EVERY_MS);
    },

    stop() {
        controller.stop();
        started = false;
        if (firstCheck) clearTimeout(firstCheck);
        if (laterChecks) clearInterval(laterChecks);
        if (retry) clearTimeout(retry);
        firstCheck = laterChecks = retry = null;
        retries = 0;
    }
});
