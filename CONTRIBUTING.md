# Contributing to SelloutShield

The block list is the project. Code changes help, but the list is what makes the extension useful.

If you’ve ever watched a channel you loved slowly turn into a template factory, you already get the point. **Join the fight**: help keep the list accurate, well-sourced, and easy to maintain.

## What to contribute

Most contributions are updates to `channels.json`:

- Add newly acquired channels
- Correct channel IDs or names
- Update ownership information
- Remove entries that were incorrect (with an explanation)

## The data format

`channels.json` must be valid JSON with this top-level shape:

```json
{
  "blockedChannels": [
    { "id": "UCxxxxxxxxxxxxxxxxxx", "name": "Channel Name", "owner": "Firm / Entity" }
  ]
}
```

Rules of thumb:

- Prefer **channel IDs** (`/channel/UC…`) over names. Names change; IDs don’t.
- Include **name** anyway (it helps with UI surfaces that don’t expose IDs).
- Keep **owner** short and specific (“KKR”, “Blackstone”, “Providence Equity”, etc.).

## Before you open a PR

### 1) Get the channel ID

Use the canonical channel URL when possible:

- `https://www.youtube.com/channel/UC...`

If you only have an `@handle` URL, open the channel and look for the channel ID in the page source, or use YouTube’s UI to find the canonical `/channel/UC…` link.

### 2) Add a source for the ownership claim

In the PR description, include at least one credible source:

- SEC filings / investor relations pages
- Reputable business press
- The acquiring company’s press release

The point isn’t to “win an argument,” it’s to keep the list clean and defensible.

### 3) Keep diffs tidy

- Add one channel per line in the array.
- Try not to reformat unrelated JSON.
- Keep entries alphabetical by `name` if the file is already organized that way. If it’s not, don’t start a reordering war—just add the entry consistently.

## How to submit

1. Fork the repo.
2. Create a branch.
3. Edit `channels.json`.
4. Open a PR with:
   - The channel URL(s)
   - The ownership source(s)
   - Any relevant notes (rebrands, merges, edge cases)

## Code contributions

If you’re changing selectors or page handling in `content.js`, include:

- The YouTube URL where the issue happens (`/results`, `/watch`, etc.)
- A screenshot (or brief screen recording) showing the missed element
- The channel name + channel URL

YouTube UI shifts constantly; reproduction details save a lot of time.

## Code of conduct

Be sharp on ideas, not on people. This project is about incentives and ownership structures—keep it factual and keep it moving.


