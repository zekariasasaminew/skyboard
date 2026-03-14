# ✈️ SkyBoard — Live Flight Explorer

```
 ███████╗██╗  ██╗██╗   ██╗██████╗  ██████╗  █████╗ ██████╗ ██████╗
 ██╔════╝██║ ██╔╝╚██╗ ██╔╝██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██╔══██╗
 ███████╗█████╔╝  ╚████╔╝ ██████╔╝██║   ██║███████║██████╔╝██║  ██║
 ╚════██║██╔═██╗   ╚██╔╝  ██╔══██╗██║   ██║██╔══██║██╔══██╗██║  ██║
 ███████║██║  ██╗   ██║   ██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝
 ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝
```

> **Track thousands of real planes in real-time. No sign-up. No API key. Just open the file.**

🌐 **[Live Demo → zekariasasaminew.github.io/skyboard](https://zekariasasaminew.github.io/skyboard)**

![Deploy to GitHub Pages](https://github.com/zekariasasaminew/skyboard/actions/workflows/deploy.yml/badge.svg)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Leaflet.js](https://img.shields.io/badge/Leaflet.js-199900?style=flat-square&logo=leaflet&logoColor=white)
![OpenSky Network](https://img.shields.io/badge/OpenSky%20Network-0078D4?style=flat-square&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## 📸 Screenshot

> _Open `index.html` in your browser and watch thousands of planes light up the map in real-time!_

```
┌─────────────────────────────────────────────────────────────┐
│ ✈️ SkyBoard  Live Flight Explorer   [Search…] 🔍  8,421 ✈  │
├───────────────────────────────────────┬─────────────────────┤
│                                       │ 📊 Live Stats       │
│   🗺️  Interactive World Map           │ ✈️ 8,421 airborne    │
│                                       │ 🚀 UAL123 - 910km/h  │
│   ✈ ✈  ✈  ✈    ✈   ✈✈  ✈            │ 🏔️ DAL456 - 42,000ft │
│  ✈   ✈     ✈   ✈      ✈             │ 🌍 🇺🇸 United States │
│      ✈  ✈    ✈    ✈  ✈  ✈           │ 📉 1,203 descending  │
│                                       ├─────────────────────┤
│  Click any plane for details ✈        │ 📡 What's Above Me? │
│                                       ├─────────────────────┤
│                                       │ 🏆 Leaderboard       │
└───────────────────────────────────────┴─────────────────────┘
```

---

## ✨ Features

### 🗺️ Live Flight Map
- **Interactive world map** powered by [Leaflet.js](https://leafletjs.com/) with OpenStreetMap tiles
- Every airborne aircraft plotted as a **✈️ airplane icon**, rotated to match its actual heading
- **Click any plane** for a detailed popup: callsign, country, altitude (ft), speed (km/h), heading, vertical rate (climb/descent/level), ICAO24 code, squawk
- **Auto-refreshes every 15 seconds** with a live countdown timer
- Live **aircraft count badge** showing total planes currently tracked

### 🔍 Flight Search
- **Search by callsign** (e.g. `BAW123`, `UAL`, `DLH`) — supports exact and prefix matching
- Auto-debounced input (no button-mashing required)
- Automatically **pans & zooms** the map to the found aircraft and opens its popup
- "No results" message if callsign isn't in the current dataset

### 📊 Live Stats Panel
Real-time analytics computed from live OpenSky data:
| Stat | Description |
|------|-------------|
| ✈️ Total Airborne | Count of flights with `on_ground === false` |
| 🚀 Fastest Plane | Highest velocity — callsign + km/h |
| 🏔️ Highest Altitude | Max baro_altitude — callsign + feet |
| 🌍 Top Country | Country with the most airborne flights |
| 📉 Descending Now | Count of planes with negative vertical rate |

### 📡 "What's Above Me?" Feature
- Click **"Planes Near Me 📡"** to grant your browser's geolocation
- Queries OpenSky's bounding-box API with a **~2° radius** around your location
- Lists up to 20 nearby flights: callsign, country, altitude, speed, **distance (km)** and **cardinal direction** (N/NE/E…)
- Shows: _"X planes within ~200km of you"_
- Places a 📍 green dot on the map at your location
- Distance calculated using the **Haversine formula**

### 🏆 Country Leaderboard
- Top 10 origin countries by number of airborne flights
- Flag emojis for 70+ countries 🇺🇸🇬🇧🇩🇪🇫🇷🇨🇳🇯🇵…
- Animated progress bars showing relative traffic share
- Collapsible panel to save screen space

---

## 🚀 How to Run

### ☁️ Option 1 — Live on GitHub Pages (no download needed!)

**[https://zekariasasaminew.github.io/skyboard](https://zekariasasaminew.github.io/skyboard)**

Just open the link — works on desktop and mobile.

### 💻 Option 2 — Run locally

**No installation. No npm. No build step. Just:**

```bash
# Simply open in browser
open index.html      # macOS
start index.html     # Windows
xdg-open index.html  # Linux

# Or serve locally (optional, for stricter browsers)
python3 -m http.server 8080
# then visit http://localhost:8080
```

That's it! The app connects directly to the OpenSky Network API from your browser.

---

## 📁 Project Structure

```
skyboard/
├── index.html    # App shell — layout, panels, map container
├── style.css     # Dark night-sky theme, glassmorphism, responsive
├── app.js        # All logic: API, map, search, stats, geolocation
└── README.md     # This file
```

---

## 🌐 How It Works — OpenSky Network API

SkyBoard uses the **[OpenSky Network REST API](https://opensky-network.org/api)** — completely free, no API key required for public endpoints.

### Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /api/states/all` | Fetch all live aircraft states worldwide |
| `GET /api/states/all?lamin=…&lomin=…&lamax=…&lomax=…` | Fetch aircraft within a geographic bounding box |

### Response Format

Each aircraft state is an array with fields in this order:

```
[0]  icao24          — Unique ICAO 24-bit transponder address
[1]  callsign        — Aircraft callsign (e.g., "BAW123  ")
[2]  origin_country  — Country of registration
[3]  time_position   — Unix timestamp of last position update
[4]  last_contact    — Unix timestamp of last ADS-B message
[5]  longitude       — WGS-84 longitude in decimal degrees
[6]  latitude        — WGS-84 latitude in decimal degrees
[7]  baro_altitude   — Barometric altitude in meters
[8]  on_ground       — Boolean — true if on ground
[9]  velocity        — Ground speed in m/s
[10] true_track      — True track (heading) in degrees clockwise from north
[11] vertical_rate   — Vertical rate in m/s (positive = climbing)
[12] sensors         — IDs of receiving sensors (may be null)
[13] geo_altitude     — Geometric altitude in meters
[14] squawk          — Transponder squawk code
[15] spi             — Special purpose indicator
[16] position_source — 0=ADS-B, 1=ASTERIX, 2=MLAT, 3=FLARM
```

### Unit Conversions
- **Altitude**: meters × 3.28084 = feet
- **Speed**: m/s × 3.6 = km/h
- Data refreshes every **15 seconds** to respect OpenSky's rate limits

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **HTML5** | App structure, semantic layout |
| **CSS3** | Dark glassmorphism theme, animations, responsive design |
| **Vanilla JavaScript (ES2020)** | All logic — no frameworks, no build tools |
| **[Leaflet.js 1.9.4](https://leafletjs.com/)** | Interactive map rendering |
| **[OpenStreetMap](https://www.openstreetmap.org/)** | Map tile data |
| **[OpenSky Network API](https://opensky-network.org/)** | Live ADS-B flight data |
| **Browser Geolocation API** | "Planes Near Me" feature |

---

## 🌍 Live Data Sources

| Source | Description |
|--------|-------------|
| **[OpenSky Network](https://opensky-network.org/)** | Community-driven ADS-B flight tracking network with thousands of ground receivers worldwide |
| **[OpenStreetMap](https://www.openstreetmap.org/)** | Open-source map tiles |

> 🛩️ **Fun Facts:**
> - OpenSky Network tracks **10,000+ flights simultaneously** at peak times
> - Data comes from a global network of ADS-B receivers operated by volunteers
> - Every commercial aircraft is required to broadcast its position via ADS-B transponder
> - ADS-B signals travel line-of-sight, so aircraft at high altitude are tracked from further away
> - The busiest air corridors are the North Atlantic (Europe ↔ North America) and East Asia

---

## ⚠️ Notes

- OpenSky's public API is **rate-limited** — the 15-second refresh interval is intentional to be respectful
- Some fields (altitude, velocity, etc.) can be **null** — SkyBoard handles these gracefully with "—"
- The first load may show up to **10,000+ markers** — modern browsers handle this well, but older hardware may be slower
- If the API returns a 429 or 503 error, a friendly error message with a **Retry** button appears

---

## 📝 License

MIT © 2024 SkyBoard Contributors

---

*Made for airport lounges, aviation enthusiasts, and anyone who's ever looked up at a jet and wondered where it's going. ✈️*