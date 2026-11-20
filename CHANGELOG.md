# Changelog

## 1.1.0 (2026-11-20)

- Fixed the glow covering the server list and the DM list when **Videos in chat** was on and Discord showed a quest promo in the sidebar
- **Videos in chat** now only looks at videos in messages, and only lights the bars inside the video's own frame, or the screen around it in fullscreen. Quest promos, shop previews and other decorative videos are left alone
- Fixed the title or the avatars of a call ending up hidden under the glow after Discord redrew them
- A small stream inside a large dark area no longer lights up the whole area

## 1.0.0 (2026-11-11)

First public release.

- Fills the black bars around streams and cameras with a glow taken from the edges of the video, in any aspect ratio
- Lights up the whole black area of a full-size stream, including the server name strip at the top and the avatar row at the bottom, without touching the channel list or the chat
- Side-by-side streams: each one lights its own half, blending in the middle
- Soft blending between the video edge and the glow
- Streams keep playing when Discord's window is covered, for example by the Start menu
- Optional glow for videos in chat
- Advanced settings for blur, colors, blending and performance
