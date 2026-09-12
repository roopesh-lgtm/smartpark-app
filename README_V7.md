# SmartPark v7 — Cloud Deployment Ready

This version is prepared for a Render Node.js Web Service.

## Render settings
- Service type: Web Service
- Root Directory: `SmartPark`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
- Environment variables: none required for the first deployment

The server binds to `0.0.0.0` and uses the `PORT` environment variable when supplied by the host.

## Local test
From the `SmartPark` directory:
```
npm install
npm start
```
Open `http://localhost:3000` and verify the dashboard.

## Important
Do not merge the ESP32 integration into the working hardware sketch until the cloud URL has been tested. Then merge only the Wi-Fi/HTTP functions.
