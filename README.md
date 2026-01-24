# Puerto Vallarta Flight Tracker

A lightweight, free flight tracker for Puerto Vallarta International Airport (PVR) that displays daily arrivals and departures. Designed to be embedded in WordPress via iframe.

## Features

- ✈️ Daily flight arrivals and departures for PVR airport
- 🔄 Auto-updates daily via GitHub Actions
- 📱 Responsive design for mobile and desktop
- 🎨 Clean, airport-style flight board aesthetic
- 💰 Completely free (uses AviationStack free tier)

## Setup Instructions

### 1. Get AviationStack API Key

1. Sign up for a free account at [aviationstack.com](https://aviationstack.com/)
2. Copy your API key from the dashboard

### 2. Configure GitHub Repository

1. Fork or clone this repository
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Create a new secret named `AVIATIONSTACK_API_KEY` with your API key

### 3. Enable GitHub Pages

1. Go to **Settings** → **Pages**
2. Under "Source", select **GitHub Actions**
3. The site will be available at `https://your-username.github.io/puerto-vallarta-flight-tracker/`

### 4. Test the Data Fetch

Run manually to test:
```bash
npm install
AVIATIONSTACK_API_KEY=your_key_here npm run fetch
```

### 5. Embed in WordPress

Add this iframe to your WordPress page:

```html
<iframe 
  src="https://your-username.github.io/puerto-vallarta-flight-tracker/" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: none; border-radius: 8px;"
  title="Puerto Vallarta Airport Flights">
</iframe>
```

## How It Works

1. **GitHub Actions** runs daily at 12:05 AM Mexico City time (06:05 UTC)
2. The script fetches current day's flights from AviationStack API
3. Data is saved to `data/flights.json`
4. GitHub Pages serves the static site with updated data

## File Structure

```
├── index.html              # Main flight board UI
├── styles.css              # Airport-style styling
├── script.js               # Load and display flight data
├── data/
│   └── flights.json        # Cached flight data (auto-updated)
├── scripts/
│   └── fetch-flights.js    # Node.js script to fetch from API
├── .github/
│   └── workflows/
│       └── update-flights.yml  # Daily cron job
└── package.json
```

## API Limits

- **Free tier**: 100 requests/month
- **Daily updates**: Uses ~60 requests/month (2 per day: arrivals + departures)
- Plenty of headroom for manual refreshes if needed

## Disclaimer

Flight information is provided for informational purposes only. Data is updated once daily and may not reflect real-time changes. Please verify flight status directly with your airline before traveling.

## License

MIT
