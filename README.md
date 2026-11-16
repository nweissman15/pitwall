# Pit Wall

An unofficial Formula 1 dashboard that runs entirely in the browser: championship
standings, the calendar, session results, lap times, track position, tyre strategy,
race control messages and per-lap car telemetry with a track map.

Data comes from the [OpenF1 API](https://openf1.org) (2023 onwards). There is no
server and no build step; the site is plain HTML, CSS and JavaScript.

## Put it online with GitHub Pages

1. Create a new public repository on GitHub and upload every file in this folder
   (keep `index.html` at the top level).
2. In the repository, open Settings, then Pages.
3. Under "Build and deployment", choose "Deploy from a branch", pick `main` and
   `/ (root)`, and save.
4. After a minute the site is at `https://<your-username>.github.io/<repository>/`.

## Run it on your own computer

Any static file server works, for example `python3 -m http.server` in this folder,
then open http://localhost:8000.

## How fresh the data is

- Free: each session's data appears shortly after the session ends. While a
  session is running, OpenF1 only serves signed-in users.
- Live: the Live tab has a sign-in for a paid OpenF1 account. It then refreshes
  the timing tower every 8 seconds during a session. OpenF1 currently withholds
  car telemetry, track location and intervals during sessions, so those still
  arrive afterwards. This live path follows OpenF1's documentation but has not
  been exercised against a real paid account.

Requests are paced to OpenF1's free limits (3 a second, 30 a minute), so a session
takes a few seconds to load.

## Files

- `index.html`, `style.css`: the page and its look
- `api.js`: the OpenF1 client (pacing, caching, sign-in)
- `charts.js`: the charts
- `app.js`: the four tabs
- `vendor/d3.min.js`: the D3 charting library (ISC licence)

Not associated with Formula 1, the FIA or any team.
