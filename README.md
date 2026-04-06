# Ride Day Grader — Stripped-Down Vercel-Safe Version

This version is intentionally simple.

It uses only:
- Next.js
- React
- plain CSS

It does **not** use:
- Tailwind
- shadcn/ui
- framer-motion
- lucide-react

## Local run

1. Open Terminal in this folder
2. Run `npm install`
3. Run `npm run dev`
4. Open the local address shown in Terminal

## Vercel deploy

1. Upload the folder contents to a GitHub repository
2. Import that repository into Vercel
3. Leave the defaults alone
4. Deploy

## What this app does

- Looks up a location
- Fetches Open-Meteo forecast data
- Fetches Environment Canada weather alerts
- Grades ride quality for commute windows and weekend windows
- Saves your preferred ride windows in the browser

## What this app does not do yet

- automatic scheduled notifications
- App Store packaging
- background alerts while closed
