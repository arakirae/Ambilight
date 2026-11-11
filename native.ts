/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 ARA
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * This part runs in Discord's main process, when Discord starts.
 *
 * When Discord's window is covered (for example by the Start menu), Chromium treats it
 * as hidden and stops drawing videos: without the plugin you would see black, with the
 * plugin only the glow would be left. Chromium's "disable-backgrounding-occluded-windows"
 * switch stops a covered window from being treated as hidden, so the stream keeps playing.
 * A minimized window is still paused as usual.
 *
 * Chromium switches can only be set before Discord opens its window, so after turning
 * the plugin on, Discord needs a full restart.
 */

import { RendererSettings } from "@main/settings";
import { app } from "electron";

const SWITCH = "disable-backgrounding-occluded-windows";

if (RendererSettings.store.plugins?.Ambilight?.enabled) {
    try {
        app.commandLine.appendSwitch(SWITCH);
    } catch {
        // Too late for this start: it will be set on the next one
    }
}

/** Whether the switch was set at startup (handy to check that it works) */
export function isKeepRenderingActive() {
    return app.commandLine.hasSwitch(SWITCH);
}
