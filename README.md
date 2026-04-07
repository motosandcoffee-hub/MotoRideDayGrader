# Ride Day Grader

A stripped-down Next.js web app for grading motorcycle riding conditions.

## Run locally

1. Install Node.js 22 or newer.
2. In Terminal, open this folder.
3. Run:
   npm install
4. Then run:
   npm run dev
5. Open the local address shown in Terminal.

## Deploy on Vercel

1. Upload this folder to GitHub.
2. In Vercel, create a new project from that GitHub repo.
3. Leave the defaults alone.
4. Deploy.

## Notes

- The app stores your preferred location and ride windows in your browser.
- Forecast data comes from Open-Meteo.
- Wind alerts come from Environment Canada.
- Ice / salt risk is a conservative forecast-based heuristic, not a live municipal operations feed.
