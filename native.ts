/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 ARA
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * This part runs in Discord's main process. It does the two things the page part of a
 * plugin can't do.
 *
 * 1. It keeps streams playing behind other windows.
 *    When Discord's window is covered (for example by the Start menu), Chromium treats it
 *    as hidden and stops drawing videos: without the plugin you would see black, with the
 *    plugin only the glow would be left. Chromium's "disable-backgrounding-occluded-windows"
 *    switch stops a covered window from being treated as hidden, so the stream keeps playing.
 *    A minimized window is still paused as usual.
 *    Chromium switches can only be set before Discord opens its window, so after turning
 *    the plugin on, Discord needs a full restart.
 *
 * 2. It updates the plugin.
 *    It reads this plugin's repository on GitHub, puts the new files in the plugin's own
 *    folder and keeps a copy of the old ones until Vencord has been rebuilt with the new ones.
 *    It talks to nothing but that repository and writes nowhere but that folder.
 */

import { RendererSettings } from "@main/settings";
import { app, IpcMainInvokeEvent } from "electron";
import { existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

// ---------- streams behind other windows ----------

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

// ---------- updates ----------

const REPO = "arakirae/Ambilight";
const BRANCH = "main";
const PLUGIN_NAME = 'name: "Ambilight"';
const VERSION_LINE = /const VERSION = "(\d+\.\d+\.\d+)";/;
const VERSION_NUMBER = /^\d+\.\d+\.\d+$/;
const COMMIT = /^[0-9a-f]{40}$/;
/** The list of the plugin's files. It lives in the repository, so a new version can add or drop a file */
const FILE_LIST = "update.json";
/** The files an update replaced, kept until Vencord has been rebuilt with the new ones */
const BACKUP = "update-backup.json";
/** Source files in the plugin's own folder: a plain name, never a path */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:tsx?|css)$/;
const MAX_FILES = 20;
const MAX_FILE_SIZE = 1024 * 1024;
const TIMEOUT_MS = 20_000;

type Backup = {
    /** The version the files belonged to before the update */
    from: string;
    /** The version the update was installing */
    to: string;
    /** What each file contained before, or null if it wasn't there */
    files: Record<string, string | null>;
};

async function download(url: string, headers?: Record<string, string>) {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${url}`);
    const text = await res.text();
    if (text.length > MAX_FILE_SIZE) throw new Error(`${url} is bigger than a plugin file should be`);
    return text;
}

/**
 * The commit the main branch is at right now.
 * Everything else is then read from that exact commit, so the files of an update always
 * belong together, even if a new version is being published in the same moment.
 */
async function latestCommit() {
    try {
        // The list of branches git itself asks for: no sign-in and no hourly limit
        const refs = await download(`https://github.com/${REPO}.git/info/refs?service=git-upload-pack`);
        const commit = refs.match(new RegExp(`([0-9a-f]{40}) refs/heads/${BRANCH}\\n`))?.[1];
        if (commit) return commit;
    } catch {
        // GitHub's API below gives the same answer
    }
    const commit = (await download(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, { Accept: "application/vnd.github.sha" })).trim();
    if (!COMMIT.test(commit)) throw new Error("GitHub didn't say which commit is the latest");
    return commit;
}

function readFileList(text: string) {
    const isList = (list: unknown): list is string[] =>
        Array.isArray(list) && list.length <= MAX_FILES && list.every(name => typeof name === "string" && FILE_NAME.test(name));

    const data = JSON.parse(text);
    const files: unknown = data?.files;
    const remove: unknown = data?.remove ?? [];
    if (!isList(files) || !isList(remove) || !files.includes("index.ts") || remove.some(name => files.includes(name)))
        throw new Error(`${FILE_LIST} on GitHub doesn't look right`);
    return { files, remove };
}

/** The folder this plugin was installed in: src/userplugins/<folder> */
function findPluginDir() {
    // dist is inside the Vencord folder: Vencord's own updater finds its sources the same way
    const base = join(__dirname, "..", "src", "userplugins");
    if (!existsSync(base)) return null;
    for (const name of readdirSync(base)) {
        const index = join(base, name, "index.ts");
        if (existsSync(index) && readFileSync(index, "utf8").includes(PLUGIN_NAME)) return join(base, name);
    }
    return null;
}

/** Writes the whole file or nothing: a file is never left half written */
function writeFile(dir: string, name: string, content: string) {
    const target = join(dir, name);
    if (existsSync(target) && readFileSync(target, "utf8") === content) return;
    try {
        writeFileSync(`${target}.new`, content);
        renameSync(`${target}.new`, target);
    } catch (err) {
        try {
            rmSync(`${target}.new`, { force: true });
        } catch {
            // Nothing more to tidy up
        }
        throw err;
    }
}

function readBackup(dir: string): Backup | null {
    try {
        const backup = JSON.parse(readFileSync(join(dir, BACKUP), "utf8"));
        const valid = typeof backup?.from === "string" && typeof backup.to === "string"
            && Object.entries(backup.files).every(([name, content]) => FILE_NAME.test(name) && (content === null || typeof content === "string"));
        return valid ? backup : null;
    } catch {
        return null;
    }
}

/** Puts back the files an update replaced. Says whether there was anything to put back */
function restore(dir: string) {
    const backup = readBackup(dir);
    if (backup) {
        for (const [name, content] of Object.entries(backup.files)) {
            if (content === null) rmSync(join(dir, name), { force: true });
            else writeFile(dir, name, content);
        }
    }
    rmSync(join(dir, BACKUP), { force: true });
    return !!backup;
}

/**
 * A backup that is still there comes from an update that was cut short, for example because
 * Discord was closed in the middle of it. If Discord still runs the version from before,
 * that update was never built, so its files go back. Otherwise the backup is just old.
 */
function settle(dir: string, running: string) {
    const backup = readBackup(dir);
    if (backup?.from === running && backup.to !== running) return restore(dir);
    rmSync(join(dir, BACKUP), { force: true });
    return false;
}

/** What the last check found: a repository that hasn't changed isn't read twice */
let seen: { commit: string; version: string | null; } | null = null;

/** The newest version on GitHub */
export async function getLatestVersion(_: IpcMainInvokeEvent) {
    try {
        const commit = await latestCommit();
        if (seen?.commit !== commit) {
            const index = await download(`https://raw.githubusercontent.com/${REPO}/${commit}/index.ts`);
            seen = { commit, version: index.match(VERSION_LINE)?.[1] ?? null };
        }
        return { ok: true as const, version: seen.version };
    } catch (err) {
        return { ok: false as const, error: String(err) };
    }
}

/** Tidies up after an update that was cut short. `running` is the version Discord is running */
export async function settleUpdate(_: IpcMainInvokeEvent, running: string) {
    try {
        const dir = findPluginDir();
        return { ok: true as const, restored: !!dir && settle(dir, running) };
    } catch (err) {
        return { ok: false as const, error: String(err) };
    }
}

/**
 * Downloads `version` and puts it in place of the installed files, keeping a copy of those.
 * When it fails, `stage` says how far it got: "download" means nothing was touched,
 * "install" means the files couldn't be written and the old ones were put back.
 */
export async function downloadUpdate(_: IpcMainInvokeEvent, version: string, running: string) {
    let stage: "download" | "install" = "download";
    let dir: string | null = null;
    try {
        if (![version, running].every(v => typeof v === "string" && VERSION_NUMBER.test(v)))
            throw new Error("that isn't a version number");

        const base = `https://raw.githubusercontent.com/${REPO}/${await latestCommit()}/`;
        const { files, remove } = readFileList(await download(base + FILE_LIST));
        const contents = await Promise.all(files.map(name => download(base + name)));

        // Only accept files that really are Ambilight, in the version that was announced
        const index = contents[files.indexOf("index.ts")];
        if (!index.includes(PLUGIN_NAME) || index.match(VERSION_LINE)?.[1] !== version)
            throw new Error(`GitHub doesn't have version ${version} right now`);

        stage = "install";
        dir = findPluginDir();
        if (!dir) throw new Error("Ambilight's folder wasn't found in src/userplugins");

        settle(dir, running);
        const backup: Backup = { from: running, to: version, files: {} };
        for (const name of [...files, ...remove]) {
            const path = join(dir, name);
            backup.files[name] = existsSync(path) ? readFileSync(path, "utf8") : null;
        }
        // After an earlier update that is still waiting for Discord to restart, the files are newer than what is running
        backup.from = backup.files["index.ts"]?.match(VERSION_LINE)?.[1] ?? running;
        writeFile(dir, BACKUP, JSON.stringify(backup));

        for (const [i, name] of files.entries()) writeFile(dir, name, contents[i]);
        for (const name of remove) rmSync(join(dir, name), { force: true });

        return { ok: true as const };
    } catch (err) {
        if (stage === "install" && dir) {
            try {
                restore(dir);
            } catch {
                // The backup stays where it is, and the next try starts by putting the files back
            }
        }
        return { ok: false as const, stage, error: String(err) };
    }
}

/** Vencord was rebuilt with the new files: the copy of the old ones isn't needed anymore */
export async function confirmUpdate(_: IpcMainInvokeEvent) {
    try {
        const dir = findPluginDir();
        if (dir) rmSync(join(dir, BACKUP), { force: true });
        return { ok: true as const };
    } catch (err) {
        return { ok: false as const, error: String(err) };
    }
}

/** Vencord couldn't be rebuilt with the new files: the old ones go back */
export async function rollbackUpdate(_: IpcMainInvokeEvent) {
    try {
        const dir = findPluginDir();
        return { ok: true as const, restored: !!dir && restore(dir) };
    } catch (err) {
        return { ok: false as const, error: String(err) };
    }
}
