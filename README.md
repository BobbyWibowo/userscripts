# Bobby's Userscripts

- [GreasyFork](https://greasyfork.org/en/users/3624-bobbywibowo#user-script-list-section)
- [OpenUserJS](https://openuserjs.org/users/BobbyWibowo/scripts)
- [ScriptCat](https://scriptcat.org/en/users/217419)

## TweetXer

[`src/TweetXer.user.js`](https://github.com/BobbyWibowo/userscripts/blob/main/src/TweetXer.user.js) — delete all your own Tweets, Favs, and DMs on X/Twitter (data-export driven, with a slower no-file mode), unfollow everyone, or export your bookmarks. This repo's version is a refactor of the [upstream TweetXer](https://greasyfork.org/en/scripts/476062-tweetxer) and is only available here — it is not published on Greasyfork or similar sites. What changed for users:

- **Explicit start/stop** — the script stays idle with a small dismissible notice instead of injecting its banner on every page load and navigating you to your profile. You start and stop it from your userscript manager's menu (a manager with menu-command support is required, e.g. Tampermonkey or Violentmonkey), and it confirms you're on your own profile with a valid session before doing anything.
- **Background-tab safe** — waits and request pacing run in a Web Worker, so browser timer throttling no longer stalls or breaks a run.
- **Nothing fails silently** — requests are paced, carry a fresh transaction id, retry with backoff, and rate limits are waited out with a visible countdown; items that ultimately fail are reported at the end instead of being dropped. (Upstream also mis-detected rate limits during bookmark export and could get stuck fetching forever.)
- **Accurate slow delete** — only your own Tweets are counted, removals are verified before counting, other people's Tweets (Replies tab) are skipped and tallied, and the run no longer ends early when the timeline is momentarily empty.
- **No hangs or crashes** — overlays that never appear time out, and problems are shown inline in the banner and notice box instead of only in the console.
- **Working bookmark export** — correct cursor pagination, auth-error handling, empty-result reporting, and a real download link.
- **Correct counts and skipping** — compact counts like "12.3K" parse correctly, automatic skipping includes a safety tolerance, and the skip count and direction (oldest or newest first) can be set manually.
- **Live progress UI** — a progress bar pinned to the top of the screen with live status text, and the controls lock while a run is active to prevent double starts.
