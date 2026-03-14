/* ============================================================
   SkyBoard — Live Flight Explorer  |  app.js
   Fetches live aircraft data from OpenSky Network API,
   renders planes on a Leaflet.js map, and powers the
   stats panel, search, "Near Me" and country leaderboard.

   Data refreshes every 15 seconds.
   ============================================================ */

'use strict';

// ─── Constants ──────────────────────────────────────────────
const OPENSKY_URL      = 'https://opensky-network.org/api/states/all';
const REFRESH_INTERVAL = 15;          // seconds
const MAX_PLANES       = 5000;        // cap for performance
const NEAR_ME_DEGREES  = 2;           // ~200 km bounding box radius
const EARTH_RADIUS_KM  = 6371;

// OpenSky states array indices
const IDX = {
  ICAO24:    0,
  CALLSIGN:  1,
  COUNTRY:   2,
  TIME_POS:  3,
  LAST_CONT: 4,
  LON:       5,
  LAT:       6,
  BARO_ALT:  7,
  ON_GROUND: 8,
  VELOCITY:  9,
  HEADING:   10,
  VERT_RATE: 11,
  GEO_ALT:   13,
  SQUAWK:    14,
};

// Country → flag emoji mapping
const COUNTRY_FLAGS = {
  'United States': '🇺🇸',
  'United Kingdom': '🇬🇧',
  'Germany': '🇩🇪',
  'France': '🇫🇷',
  'China': '🇨🇳',
  'Japan': '🇯🇵',
  'Canada': '🇨🇦',
  'Australia': '🇦🇺',
  'Russia': '🇷🇺',
  'Spain': '🇪🇸',
  'Italy': '🇮🇹',
  'Netherlands': '🇳🇱',
  'Switzerland': '🇨🇭',
  'Turkey': '🇹🇷',
  'Brazil': '🇧🇷',
  'India': '🇮🇳',
  'South Korea': '🇰🇷',
  'Mexico': '🇲🇽',
  'Norway': '🇳🇴',
  'Sweden': '🇸🇪',
  'Denmark': '🇩🇰',
  'Finland': '🇫🇮',
  'Poland': '🇵🇱',
  'Portugal': '🇵🇹',
  'Greece': '🇬🇷',
  'Austria': '🇦🇹',
  'Belgium': '🇧🇪',
  'Ireland': '🇮🇪',
  'Singapore': '🇸🇬',
  'New Zealand': '🇳🇿',
  'South Africa': '🇿🇦',
  'United Arab Emirates': '🇦🇪',
  'Saudi Arabia': '🇸🇦',
  'Israel': '🇮🇱',
  'Thailand': '🇹🇭',
  'Malaysia': '🇲🇾',
  'Indonesia': '🇮🇩',
  'Egypt': '🇪🇬',
  'Argentina': '🇦🇷',
  'Chile': '🇨🇱',
  'Colombia': '🇨🇴',
  'Ukraine': '🇺🇦',
  'Czech Republic': '🇨🇿',
  'Hungary': '🇭🇺',
  'Romania': '🇷🇴',
  'Bulgaria': '🇧🇬',
  'Croatia': '🇭🇷',
  'Serbia': '🇷🇸',
  'Slovakia': '🇸🇰',
  'Luxembourg': '🇱🇺',
  'Iceland': '🇮🇸',
  'Latvia': '🇱🇻',
  'Lithuania': '🇱🇹',
  'Estonia': '🇪🇪',
  'Slovenia': '🇸🇮',
  'Malta': '🇲🇹',
  'Cyprus': '🇨🇾',
  'Morocco': '🇲🇦',
  'Nigeria': '🇳🇬',
  'Kenya': '🇰🇪',
  'Ethiopia': '🇪🇹',
  'Pakistan': '🇵🇰',
  'Bangladesh': '🇧🇩',
  'Vietnam': '🇻🇳',
  'Philippines': '🇵🇭',
  'Taiwan': '🇹🇼',
  'Hong Kong': '🇭🇰',
  'Qatar': '🇶🇦',
  'Kuwait': '🇰🇼',
};

// ─── State ───────────────────────────────────────────────────
let map;
let markersLayer;
let allFlights    = [];   // raw state arrays from last fetch
let markerMap     = {};   // icao24 → Leaflet marker
let countdownVal  = REFRESH_INTERVAL;
let countdownTimer;
let refreshTimer;
let searchDebounce;
let isFetching    = false;

// ─── DOM Refs ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const loadingOverlay = $('loading-overlay');
const errorOverlay   = $('error-overlay');
const errorMessage   = $('error-message');
const countdownEl    = $('countdown');
const aircraftCount  = $('aircraft-count');
const searchInput    = $('search-input');
const searchResult   = $('search-result');
const nearmeBtn      = $('nearme-btn');
const nearmeResult   = $('nearme-result');
const lbContent      = $('lb-content');
const lbToggle       = $('lb-toggle');
const lbList         = $('leaderboard-list');
const refreshBtn     = $('refresh-btn');
const retryBtn       = $('retry-btn');

// ─── Map Initialisation ──────────────────────────────────────
function initMap() {
  map = L.map('map', {
    center:  [30, 0],
    zoom:    3,
    minZoom: 2,
    maxZoom: 12,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

// ─── Airplane SVG icon factory ───────────────────────────────
function planeIcon(heading, isHighlighted) {
  const deg     = (heading == null) ? 0 : heading;
  const color   = isHighlighted ? '#ff6b6b' : '#00d4ff';
  const outline = isHighlighted ? '#fff'    : 'rgba(0,0,0,0.6)';
  const size    = isHighlighted ? 20        : 14;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      width="${size}" height="${size}"
      style="transform:rotate(${deg}deg);filter:drop-shadow(0 0 3px ${color});">
    <path fill="${color}" stroke="${outline}" stroke-width="0.5"
      d="M12 2 L15 9 L22 10 L16 15 L17.5 22 L12 19 L6.5 22 L8 15 L2 10 L9 9 Z"/>
  </svg>`;

  return L.divIcon({
    html:        `<div class="plane-icon-wrapper${isHighlighted ? ' plane-highlight' : ''}">${svg}</div>`,
    className:   '',
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size / 2],
    popupAnchor: [0, -(size / 2) - 4],
  });
}

// ─── Popup HTML ──────────────────────────────────────────────
function buildPopupHtml(f) {
  const callsign  = (f[IDX.CALLSIGN] || '').trim() || f[IDX.ICAO24] || 'Unknown';
  const country   = f[IDX.COUNTRY]   || 'Unknown';
  const altM      = f[IDX.BARO_ALT];
  const altFt     = altM != null ? Math.round(altM * 3.28084).toLocaleString() : '—';
  const velMs     = f[IDX.VELOCITY];
  const velKph    = velMs != null ? Math.round(velMs * 3.6).toLocaleString() : '—';
  const heading   = f[IDX.HEADING]   != null ? Math.round(f[IDX.HEADING]) + '°' : '—';
  const vrate     = f[IDX.VERT_RATE];
  const onGround  = f[IDX.ON_GROUND];
  const squawk    = f[IDX.SQUAWK]    || '—';

  let vrateStr   = '— m/s';
  let vrateClass = 'vrate-level';
  if (vrate != null) {
    if (vrate > 0.5)       { vrateStr = `+${vrate.toFixed(1)} m/s ↑`; vrateClass = 'vrate-climb'; }
    else if (vrate < -0.5) { vrateStr = `${vrate.toFixed(1)} m/s ↓`;  vrateClass = 'vrate-desc';  }
    else                   { vrateStr = 'Level ↔';                     vrateClass = 'vrate-level'; }
  }

  const flag = COUNTRY_FLAGS[country] || '🌐';

  return `
    <div class="popup-callsign">✈️ ${callsign}</div>
    <div class="popup-grid">
      <div class="popup-item">
        <span class="popup-label">Country</span>
        <span class="popup-value">${flag} ${country}</span>
      </div>
      <div class="popup-item">
        <span class="popup-label">Status</span>
        <span class="popup-value">${onGround ? '🛬 On Ground' : '🛫 Airborne'}</span>
      </div>
      <div class="popup-item">
        <span class="popup-label">Altitude</span>
        <span class="popup-value">${altFt} ft</span>
      </div>
      <div class="popup-item">
        <span class="popup-label">Speed</span>
        <span class="popup-value">${velKph} km/h</span>
      </div>
      <div class="popup-item">
        <span class="popup-label">Heading</span>
        <span class="popup-value">${heading}</span>
      </div>
      <div class="popup-item">
        <span class="popup-label">Vertical Rate</span>
        <span class="popup-value ${vrateClass}">${vrateStr}</span>
      </div>
      <div class="popup-item">
        <span class="popup-label">ICAO24</span>
        <span class="popup-value">${f[IDX.ICAO24] || '—'}</span>
      </div>
      <div class="popup-item">
        <span class="popup-label">Squawk</span>
        <span class="popup-value">${squawk}</span>
      </div>
    </div>`;
}

// ─── Render Markers ──────────────────────────────────────────
function renderMarkers(flights) {
  markersLayer.clearLayers();
  markerMap = {};

  const subset = flights.slice(0, MAX_PLANES);

  subset.forEach(f => {
    const lat = f[IDX.LAT];
    const lon = f[IDX.LON];
    if (lat == null || lon == null) return;

    const marker = L.marker([lat, lon], { icon: planeIcon(f[IDX.HEADING], false) });
    marker.bindPopup(buildPopupHtml(f), { maxWidth: 280, minWidth: 240 });

    markersLayer.addLayer(marker);
    const key = (f[IDX.ICAO24] || '') + '_' + (f[IDX.CALLSIGN] || '').trim();
    markerMap[key] = { marker, flight: f };
  });
}

// ─── Stats Panel ─────────────────────────────────────────────
function updateStats(flights) {
  const airborne = flights.filter(f => !f[IDX.ON_GROUND]);

  // Total airborne
  animateNumber('stat-airborne', airborne.length.toLocaleString());

  // Fastest
  let fastest = null;
  airborne.forEach(f => {
    if (f[IDX.VELOCITY] != null && (!fastest || f[IDX.VELOCITY] > fastest[IDX.VELOCITY])) {
      fastest = f;
    }
  });
  if (fastest) {
    const call = (fastest[IDX.CALLSIGN] || '').trim() || fastest[IDX.ICAO24] || '?';
    const spd  = Math.round(fastest[IDX.VELOCITY] * 3.6);
    $('stat-fastest').textContent = `${call} — ${spd.toLocaleString()} km/h`;
  } else {
    $('stat-fastest').textContent = '—';
  }

  // Highest altitude
  let highest = null;
  airborne.forEach(f => {
    if (f[IDX.BARO_ALT] != null && (!highest || f[IDX.BARO_ALT] > highest[IDX.BARO_ALT])) {
      highest = f;
    }
  });
  if (highest) {
    const call = (highest[IDX.CALLSIGN] || '').trim() || highest[IDX.ICAO24] || '?';
    const alt  = Math.round(highest[IDX.BARO_ALT] * 3.28084);
    $('stat-highest').textContent = `${call} — ${alt.toLocaleString()} ft`;
  } else {
    $('stat-highest').textContent = '—';
  }

  // Most common country
  const countryCounts = {};
  airborne.forEach(f => {
    const c = f[IDX.COUNTRY] || 'Unknown';
    countryCounts[c] = (countryCounts[c] || 0) + 1;
  });
  const topCountry = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCountry) {
    const flag = COUNTRY_FLAGS[topCountry[0]] || '🌐';
    $('stat-country').textContent = `${flag} ${topCountry[0]} (${topCountry[1]})`;
  } else {
    $('stat-country').textContent = '—';
  }

  // Descending
  const descending = airborne.filter(f => f[IDX.VERT_RATE] != null && f[IDX.VERT_RATE] < -0.5).length;
  $('stat-descending').textContent = descending.toLocaleString();

  // Country leaderboard
  updateLeaderboard(countryCounts);
}

// ─── Leaderboard ─────────────────────────────────────────────
function updateLeaderboard(countryCounts) {
  const top10 = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (!top10.length) { lbList.innerHTML = '<li class="lb-placeholder">No data</li>'; return; }

  const maxCount = top10[0][1];

  lbList.innerHTML = top10.map(([country, count], i) => {
    const flag    = COUNTRY_FLAGS[country] || '🌐';
    const rank    = i + 1;
    const rankCls = rank <= 3 ? 'top3' : '';
    const barW    = Math.round((count / maxCount) * 100);
    return `
      <li class="lb-item">
        <span class="lb-rank ${rankCls}">${rank}</span>
        <span class="lb-flag">${flag}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="lb-name">${country}</span>
            <span class="lb-count">${count.toLocaleString()}</span>
          </div>
          <div class="lb-bar" style="width:${barW}%"></div>
        </div>
      </li>`;
  }).join('');
}

// ─── Animate Number Helper ───────────────────────────────────
function animateNumber(elId, newText) {
  const el = $(elId);
  if (!el) return;
  el.style.opacity = '0.4';
  requestAnimationFrame(() => {
    el.textContent = newText;
    el.style.transition = 'opacity 0.3s';
    el.style.opacity    = '1';
  });
}

// ─── Fetch Flights ───────────────────────────────────────────
async function fetchFlights(bbox) {
  if (isFetching) return;
  isFetching = true;

  let url = OPENSKY_URL;
  if (bbox) {
    const { lamin, lomin, lamax, lomax } = bbox;
    url += `?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 20000);

  try {
    const res  = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    clearTimeout(timeout);
    return data.states || [];
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  } finally {
    isFetching = false;
  }
}

// ─── Main Refresh ────────────────────────────────────────────
async function refresh(showLoading) {
  if (showLoading) {
    loadingOverlay.style.display = 'flex';
    loadingOverlay.style.opacity = '1';
  }
  errorOverlay.classList.add('hidden');
  refreshBtn.classList.add('spinning');

  try {
    const states = await fetchFlights();
    allFlights   = states;

    renderMarkers(states);
    updateStats(states);

    const total = states.length;
    aircraftCount.textContent = total.toLocaleString();

    // Fade out loading overlay
    if (showLoading) {
      loadingOverlay.style.transition = 'opacity 0.4s';
      loadingOverlay.style.opacity    = '0';
      setTimeout(() => { loadingOverlay.style.display = 'none'; }, 400);
    }
  } catch (err) {
    console.error('SkyBoard fetch error:', err);
    if (showLoading) loadingOverlay.style.display = 'none';
    errorMessage.textContent = `Could not load flight data: ${err.message}. Check your connection and try again.`;
    errorOverlay.classList.remove('hidden');
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

// ─── Countdown Timer ─────────────────────────────────────────
function startCountdown() {
  clearInterval(countdownTimer);
  countdownVal = REFRESH_INTERVAL;
  countdownEl.textContent = countdownVal + 's';

  countdownTimer = setInterval(() => {
    countdownVal--;
    countdownEl.textContent = countdownVal + 's';
    if (countdownVal <= 0) {
      refresh(false);    // Data refreshes every 15 seconds
      countdownVal = REFRESH_INTERVAL;
    }
  }, 1000);
}

// ─── Search ──────────────────────────────────────────────────
function doSearch(query) {
  query = (query || '').trim().toUpperCase();
  searchResult.className = 'search-result';

  if (!query) {
    searchResult.classList.add('hidden');
    return;
  }

  const found = allFlights.find(f => {
    const cs = (f[IDX.CALLSIGN] || '').trim().toUpperCase();
    return cs === query || cs.startsWith(query);
  });

  if (found) {
    const lat = found[IDX.LAT];
    const lon = found[IDX.LON];
    const cs  = (found[IDX.CALLSIGN] || '').trim() || found[IDX.ICAO24] || '?';

    if (lat != null && lon != null) {
      map.setView([lat, lon], 7, { animate: true });

      // Find and open popup
      const key = (found[IDX.ICAO24] || '') + '_' + (found[IDX.CALLSIGN] || '').trim();
      if (markerMap[key]) {
        markerMap[key].marker.openPopup();
      }
    }

    const alt = found[IDX.BARO_ALT] != null
      ? Math.round(found[IDX.BARO_ALT] * 3.28084).toLocaleString() + ' ft'
      : '—';
    const spd = found[IDX.VELOCITY] != null
      ? Math.round(found[IDX.VELOCITY] * 3.6).toLocaleString() + ' km/h'
      : '—';

    searchResult.innerHTML = `
      <strong style="color:var(--accent)">✈️ ${cs}</strong><br>
      ${found[IDX.COUNTRY] || '—'} &nbsp;·&nbsp; ${alt} &nbsp;·&nbsp; ${spd}`;
  } else {
    searchResult.classList.add('not-found');
    searchResult.textContent = `No aircraft matching "${query}" found.`;
  }
}

// ─── Haversine Distance ──────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLon  = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Cardinal Bearing ────────────────────────────────────────
function bearing(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180;
  const dLon  = toRad(lon2 - lon1);
  const y     = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x     = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
              - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng  = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const dirs  = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(brng / 45) % 8];
}

// ─── "Near Me" Feature ───────────────────────────────────────
async function findNearMe() {
  nearmeBtn.disabled = true;
  nearmeBtn.textContent = 'Locating… 📡';
  nearmeResult.classList.add('hidden');
  nearmeResult.innerHTML = '';

  if (!navigator.geolocation) {
    showNearmeError('Geolocation is not supported by your browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async pos => {
      const userLat = pos.coords.latitude;
      const userLon = pos.coords.longitude;

      const bbox = {
        lamin: userLat - NEAR_ME_DEGREES,
        lomin: userLon - NEAR_ME_DEGREES,
        lamax: userLat + NEAR_ME_DEGREES,
        lomax: userLon + NEAR_ME_DEGREES,
      };

      nearmeBtn.textContent = 'Fetching nearby…';

      try {
        const states = await fetchFlights(bbox);

        if (!states.length) {
          nearmeResult.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;">No flights found in your area right now.</div>';
          nearmeResult.classList.remove('hidden');
          nearmeBtn.disabled    = false;
          nearmeBtn.textContent = 'Planes Near Me 📡';
          return;
        }

        // Filter airborne, compute distance, sort
        const nearby = states
          .filter(f => !f[IDX.ON_GROUND] && f[IDX.LAT] != null && f[IDX.LON] != null)
          .map(f => ({
            flight: f,
            dist:   haversine(userLat, userLon, f[IDX.LAT], f[IDX.LON]),
            dir:    bearing(userLat, userLon, f[IDX.LAT], f[IDX.LON]),
          }))
          .filter(x => x.dist <= 200)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 20);

        if (!nearby.length) {
          nearmeResult.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;">No airborne flights within 200 km of you right now.</div>';
        } else {
          const items = nearby.map(({ flight: f, dist, dir }) => {
            const cs  = (f[IDX.CALLSIGN] || '').trim() || f[IDX.ICAO24] || '?';
            const alt = f[IDX.BARO_ALT] != null
              ? Math.round(f[IDX.BARO_ALT] * 3.28084).toLocaleString() + ' ft'
              : '—';
            const spd = f[IDX.VELOCITY] != null
              ? Math.round(f[IDX.VELOCITY] * 3.6).toLocaleString() + ' km/h'
              : '—';
            return `
              <div class="nearme-item">
                <span class="nearme-callsign">✈️ ${cs}</span>
                <span class="nearme-detail">${f[IDX.COUNTRY] || '—'} &nbsp;·&nbsp; ${alt} &nbsp;·&nbsp; ${spd}</span>
                <span class="nearme-detail">${Math.round(dist)} km ${dir} of you</span>
              </div>`;
          }).join('');

          nearmeResult.innerHTML = `
            <div class="nearme-summary">${nearby.length} plane${nearby.length !== 1 ? 's' : ''} within ~200km of you</div>
            ${items}`;
        }

        nearmeResult.classList.remove('hidden');

        // Pan map to user location
        map.setView([userLat, userLon], 7, { animate: true });

        // Add a pulsing marker for the user
        const userIcon = L.divIcon({
          html: '<div style="width:14px;height:14px;border-radius:50%;background:#00ff9d;border:2px solid #fff;box-shadow:0 0 12px #00ff9d;animation:markerPulse 1.2s ease-in-out infinite;"></div>',
          className: '',
          iconSize:   [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([userLat, userLon], { icon: userIcon })
          .bindPopup('<b>📍 You are here</b>')
          .addTo(markersLayer)
          .openPopup();

      } catch (err) {
        showNearmeError('Could not fetch nearby flights: ' + err.message);
      }

      nearmeBtn.disabled    = false;
      nearmeBtn.textContent = 'Planes Near Me 📡';
    },
    err => {
      const msgs = {
        1: 'Location permission denied. Please allow location access.',
        2: 'Location unavailable. Try again.',
        3: 'Location request timed out.',
      };
      showNearmeError(msgs[err.code] || 'Unknown geolocation error.');
      nearmeBtn.disabled    = false;
      nearmeBtn.textContent = 'Planes Near Me 📡';
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}

function showNearmeError(msg) {
  nearmeResult.innerHTML = `<div style="color:var(--danger);font-size:0.82rem;">⚠️ ${msg}</div>`;
  nearmeResult.classList.remove('hidden');
  nearmeBtn.disabled    = false;
  nearmeBtn.textContent = 'Planes Near Me 📡';
}

// ─── Leaderboard collapse toggle ─────────────────────────────
lbToggle.addEventListener('click', () => {
  const collapsed = lbContent.classList.toggle('collapsed');
  lbToggle.textContent    = collapsed ? '▼' : '▲';
  lbToggle.setAttribute('aria-expanded', String(!collapsed));
});

// ─── Event Listeners ─────────────────────────────────────────
refreshBtn.addEventListener('click', () => {
  countdownVal = REFRESH_INTERVAL;
  refresh(false);
});

retryBtn.addEventListener('click', () => {
  errorOverlay.classList.add('hidden');
  refresh(true);
});

nearmeBtn.addEventListener('click', findNearMe);

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => doSearch(searchInput.value), 350);
});

document.getElementById('search-btn').addEventListener('click', () => {
  doSearch(searchInput.value);
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch(searchInput.value);
  if (e.key === 'Escape') {
    searchResult.classList.add('hidden');
    searchInput.value = '';
  }
});

// Close search result when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrapper')) {
    searchResult.classList.add('hidden');
  }
});

// ─── Boot ─────────────────────────────────────────────────────
(function init() {
  initMap();
  refresh(true);
  startCountdown();
})();
