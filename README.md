# SelloutShield

<p align="center">
  <img src="assets/logo.png" alt="SelloutShield" width="720" />
</p>

YouTube is at its best when it’s made by humans with a point of view. Private equity ownership tends to push in the opposite direction: more volume, safer formats, more ad inventory, less craft.

SelloutShield is a small way to opt out. It helps keep “rolled up” channels from taking over your feed so the creators you actually care about don’t get drowned out.

## What it does

- Hides videos from blocked channels across common YouTube surfaces (home, search, subscriptions, “Up next”, etc.).
- Shows a full-screen “Blocked by SelloutShield” overlay on blocked channel pages and (when detectable) blocked watch pages.
- Keeps the list updated: fetches `channels.json` on install and then every 24 hours (and when you click **Check for Updates** in the popup).

## Block list format

`channels.json` must look like this:

```json
{
  "blockedChannels": [
    { "id": "UCxxxxxxxxxxxxxxxxxx", "name": "Channel Name", "owner": "Firm / Entity" }
  ]
}
```

Matching rules:

- Prefer `id` (channel IDs don’t change).
- `name` is a fallback for YouTube surfaces that don’t expose IDs.

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the folder that contains `manifest.json`
4. Open YouTube (refresh any already-open tabs)

## How updates work

- The service worker (`background.js`) downloads the list from `CONFIG.sourceUrl` (by default the raw GitHub URL for this repo’s `channels.json`).
- It checks daily via a Chrome alarm, and also on install and via the popup button.
- It uses `ETag` / `If-None-Match`, so most daily checks are a lightweight 304 when nothing changed.
- If the remote fetch fails, it falls back to the packaged `channels.json`.

## Repo layout (what to edit)

- `channels.json`: the list (this repo hosts it)
- `injected.js`: main-world injector that filters YouTube’s initial data and `youtubei` responses
- `content.js`: UI overlay + passes the compiled block rules into `injected.js`
- `background.js`: list fetch + caching + 24h refresh alarm
- `popup.html` / `popup.css` / `popup.js`: popup UI

## Contributing

Most contributions are edits to `channels.json`. If you open a PR, include a source for the ownership claim.

See `CONTRIBUTING.md` for the checklist and formatting rules.

## Development

No build step. After edits:

1. `chrome://extensions` → SelloutShield → **Reload**
2. Refresh YouTube tabs

To inspect the service worker: `chrome://extensions` → SelloutShield → **Service worker** → **Inspect**.

## Limitations

- YouTube changes renderer shapes regularly; occasionally the filtering rules need updates.
- This is an in-page filter (patches page `fetch`/XHR and filters renderer JSON), not a network-layer blocker.

## Privacy

- Runs only on `https://www.youtube.com/*`
- Stores the block list + metadata in `chrome.storage.local`
- No analytics

## License

MIT. See `LICENSE`.
