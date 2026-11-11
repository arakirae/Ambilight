/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 ARA
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

import { AmbilightController } from "./ambilight";

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
        description: "Also adds the glow to videos attached or embedded in messages.",
        default: false
    },
    multiLive: {
        type: OptionType.BOOLEAN,
        displayName: "Side-by-side streams",
        description: "When you watch several streams next to each other, each one lights its own part of the screen, blending in the middle. When off, there is no glow in this layout.",
        default: true
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

export default definePlugin({
    name: "Ambilight",
    description: "Fills the black bars around streams, cameras and videos with a glow that takes its colors from the edges of the video, in any aspect ratio.",
    authors: [{ name: "ARA", id: 0n }],
    settings,

    start() {
        controller.start();
    },

    stop() {
        controller.stop();
    }
});
