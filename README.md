# Ambilight

A [Vencord](https://vencord.dev) plugin that fills the black bars around Discord streams with a soft glow taken from the edges of the video, like an Ambilight TV.

Watching a 16:9 stream on an ultrawide monitor, or an ultrawide stream on a 16:9 one, the empty bars light up with the colors of the game instead of staying black.

[![Vencord plugin](https://img.shields.io/badge/Vencord-plugin-f9a8d4)](https://vencord.dev)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-f9a8d4)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-f9a8d4)](LICENSE)

**Italiano:** [leggi la guida in italiano](README.it.md)

## Quick install

On Windows, open **PowerShell**, paste this and press Enter:

```powershell
irm https://raw.githubusercontent.com/arakirae/Ambilight/main/install.ps1 | iex
```

Follow the window, then fully close Discord, open it again and turn on **Ambilight** in **User Settings → Vencord → Plugins**. Step by step guide and other ways to install: [Installation](#installation).

## Features

- **Any aspect ratio.** Bars on the sides (a 16:9 stream on an ultrawide screen) or above and below (an ultrawide stream on a 16:9 screen): the glow adapts by itself.
- **The whole black area lights up.** When you watch a stream full size, the glow also fills the strip with the server name at the top and the row of avatars at the bottom. It never spills onto the channel list or the chat.
- **Side-by-side streams.** When you watch two streams next to each other, each one lights its own half, blending softly in the middle.
- **Soft edges.** The edge of the video fades into the glow instead of ending with a hard line.
- **Streams keep playing behind the Start menu.** Normally, when something covers Discord's window, Windows treats it as hidden and Discord stops drawing the stream. Ambilight keeps it playing. A minimized Discord still pauses as usual, to save resources.
- **Leaves grids alone.** In the grid with several people, nothing changes.
- **Light on your PC.** The glow is computed from a tiny 160 px copy of the video, 30 times a second by default, and only while there are bars to fill.

## What it doesn't do

- **Pop-out stream windows.** Streams opened in a separate window stay as they are.
- **Grids with several tiles.** If the grid mixes streams and people, the bars stay black.
- **Change the stream itself.** It only paints the empty space around the video: what you see inside the video, and what others see, doesn't change.

## Before you start

- **Windows** with the **Discord desktop app** (not the browser).
- **Vencord built from source.** Plugins like this one only work with a Vencord you build yourself. The installer does it for you and keeps your Vencord settings.

Vencord's team doesn't support custom plugins, so please ask for help with Ambilight [here](../../issues), not in Vencord's server.

## Installation

### One command (fastest)

1. Open **PowerShell**: press Start, type `powershell` and press Enter.
2. Paste this and press Enter:

   ```powershell
   irm https://raw.githubusercontent.com/arakirae/Ambilight/main/install.ps1 | iex
   ```

3. Follow the window. It installs what's missing, downloads Ambilight and builds Vencord (this can take a few minutes). When it asks whether to install Vencord into Discord, answer **Y** the first time, then pick your Discord with the arrow keys and press Enter.
4. Fully close Discord: right click its icon next to the clock → **Quit Discord**. Then open it again.
5. Go to **User Settings → Vencord → Plugins**, search for **Ambilight** and turn it on.
6. The first time, fully close and reopen Discord once more. This turns on the part that keeps streams playing behind the Start menu.

The command downloads [install.ps1](install.ps1) from this repository and runs it. It's the same installer that Install.bat starts, and you can read it before running it.

### Automatic, with the ZIP

1. Download **[Ambilight.zip](https://github.com/arakirae/Ambilight/releases/latest/download/Ambilight.zip)** from the latest release. It holds only what you need to install.
2. Right click the ZIP → **Extract All**.
3. Open the extracted folder and double-click **Install.bat**.
   If Windows shows a warning, click **More info → Run anyway** (or **Run**).
4. Follow the window. The installer:
   - installs Git and Node.js if they're missing (Windows may ask for permission)
   - installs pnpm
   - updates your Vencord folder if you already build Vencord from source (in your user folder or in Documents), otherwise downloads Vencord into `C:\Users\<you>\Vencord`
   - adds Ambilight and builds Vencord
   - asks whether to install Vencord into Discord: answer **Y** the first time, then pick your Discord with the arrow keys and press Enter
5. Fully close Discord: right click its icon next to the clock → **Quit Discord**. Then open it again.
6. Go to **User Settings → Vencord → Plugins**, search for **Ambilight** and turn it on, then fully restart Discord once more.

### Manual (if you already build Vencord from source)

1. In your Vencord folder, create `src\userplugins\ambilight`.
2. Put `index.ts`, `ambilight.ts` and `native.ts` from this repository in it.
3. Run `pnpm build` in your Vencord folder.
4. Fully restart Discord, turn on Ambilight, then fully restart Discord once more.

Vencord's own guide: [installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/).

## Settings

| Setting | Default | What it does |
|---|---|---|
| Streams and cameras | On | Adds the glow to Go Live streams and cameras in voice calls |
| Videos in chat | Off | Also adds the glow to videos attached or embedded in messages |
| Side-by-side streams | On | When you watch several streams next to each other, each one lights its own part of the screen. When off, there is no glow in this layout |
| Advanced settings | Off | Shows the fine-tuning options below |

Advanced settings:

| Setting | Default | What it does |
|---|---|---|
| Blur | 60 | How soft the glow is, in pixels |
| Saturation | 140% | Color intensity of the glow. 100% keeps the original colors |
| Brightness | 110% | Brightness of the glow. 100% keeps the original brightness |
| Video edge blending | 35 | Width, in pixels, of the blend between the edge of the video and the glow. 0 keeps a sharp edge |
| Sampling area | 12% | How much of the video edge gives the colors of the bars. Higher values give steadier, smoother colors |
| Fade to black | 20% | How much the glow darkens toward the outer edges of the screen |
| Transition smoothness | 60% | How slowly the glow follows color changes. Higher values prevent flicker |
| Updates per second | 30 | How often the glow is updated. Lower values use less CPU and GPU |

Changes apply right away, while you watch.

## Updating

Paste the install command again, or download [Ambilight.zip](https://github.com/arakirae/Ambilight/releases/latest/download/Ambilight.zip) again and run **Install.bat**. Your settings are kept.

## Uninstalling

- To turn it off, disable Ambilight in **Vencord → Plugins**, then fully restart Discord.
- To remove it, delete the `src\userplugins\ambilight` folder inside your Vencord folder (usually `C:\Users\<you>\Vencord`), run `pnpm build` in your Vencord folder, then fully restart Discord.

## FAQ

**Does Ambilight connect to the internet?**
No. Everything happens on your PC, from the video Discord is already showing you. Only the installer downloads files: Vencord and this plugin from GitHub.

**Do the people streaming see the glow?**
No, it's only on your screen. They don't need the plugin, and nothing changes for them.

**Does it slow down my PC?**
Very little. The colors come from a 160 px copy of the video. If you want it even lighter, lower **Updates per second** in the advanced settings.

**Why do I need to restart Discord twice the first time?**
The part that keeps streams playing behind the Start menu has to be set before Discord opens its window, and only if Ambilight is turned on. The first restart loads the plugin, the second one turns that part on. After that, a normal start is enough.

**Can I get banned for this?**
Client mods like Vencord go against Discord's Terms of Service. Vencord says there are no known cases of users banned for using client mods, but you use them at your own risk.

**Does it work in the browser, on Vesktop, macOS or Linux?**
It was made and tested on Windows with the Discord desktop app. The browser isn't supported, and the rest is untested.

**The installer says something went wrong.**
The red message says what failed. Most often Git or Node.js was just installed and Windows hasn't picked it up yet: close the window, open a new PowerShell window and paste the command again (or run Install.bat again). If it still fails, [open an issue](../../issues) with a screenshot.

## Credits

- Made by ARA.
- Built on [Vencord](https://github.com/Vendicated/Vencord).
- Inspired by [Ambient light for YouTube](https://github.com/WesselKroos/youtube-ambilight) by Wessel Kroos.

## Support

Ambilight is free. If you like it, you can [buy me a coffee on Ko-fi](https://ko-fi.com/arakirae). Found a bug or have an idea? [Open an issue](../../issues).

## License

[GPL-3.0-or-later](LICENSE). You can use, change and share Ambilight freely, as long as what you share stays under the same license.

Ambilight isn't affiliated with Discord, Vencord or Philips. Ambilight is a trademark of Philips; this plugin only borrows the idea.
