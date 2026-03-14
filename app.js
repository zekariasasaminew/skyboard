/* ============================================================
   SkyBoard — Live Flight Explorer  |  app.js
   WebGL-rendered flight tracker using MapLibre GL JS.
   Fetches live aircraft from OpenSky Network API,
   renders planes via GPU symbol layer, with smooth
   interpolation, stats, search, and leaderboard.
   ============================================================ */

'use strict';

// ─── Constants ──────────────────────────────────────────────
const OPENSKY_URL              = 'https://opensky-network.org/api/states/all';
const REFRESH_INTERVAL_SECONDS = 15;
const NEAR_ME_DEGREES          = 2;
const EARTH_RADIUS_KM          = 6371;
const API_TIMEOUT_MS           = 20000;
const SEARCH_DEBOUNCE_MS       = 350;
const INTERP_DURATION_MS       = 12000;
const ANIM_THROTTLE_MS         = 50;

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
  'United States': '🇺🇸', 'United Kingdom': '🇬🇧', 'Germany': '🇩🇪',
  'France': '🇫🇷', 'China': '🇨🇳', 'Japan': '🇯🇵', 'Canada': '🇨🇦',
  'Australia': '🇦🇺', 'Russia': '🇷🇺', 'Spain': '🇪🇸', 'Italy': '🇮🇹',
  'Netherlands': '🇳🇱', 'Switzerland': '🇨🇭', 'Turkey': '🇹🇷',
  'Brazil': '🇧🇷', 'India': '🇮🇳', 'South Korea': '🇰🇷', 'Mexico': '🇲🇽',
  'Norway': '🇳🇴', 'Sweden': '🇸🇪', 'Denmark': '🇩🇰', 'Finland': '🇫🇮',
  'Poland': '🇵🇱', 'Portugal': '🇵🇹', 'Greece': '🇬🇷', 'Austria': '🇦🇹',
  'Belgium': '🇧🇪', 'Ireland': '🇮🇪', 'Singapore': '🇸🇬',
  'New Zealand': '🇳🇿', 'South Africa': '🇿🇦', 'United Arab Emirates': '🇦🇪',
  'Saudi Arabia': '🇸🇦', 'Israel': '🇮🇱', 'Thailand': '🇹🇭',
  'Malaysia': '🇲🇾', 'Indonesia': '🇮🇩', 'Egypt': '🇪🇬', 'Argentina': '🇦🇷',
  'Chile': '🇨🇱', 'Colombia': '🇨🇴', 'Ukraine': '🇺🇦',
  'Czech Republic': '🇨🇿', 'Hungary': '🇭🇺', 'Romania': '🇷🇴',
  'Bulgaria': '🇧🇬', 'Croatia': '🇭🇷', 'Serbia': '🇷🇸', 'Slovakia': '🇸🇰',
  'Luxembourg': '🇱🇺', 'Iceland': '🇮🇸', 'Latvia': '🇱🇻',
  'Lithuania': '🇱🇹', 'Estonia': '🇪🇪', 'Slovenia': '🇸🇮', 'Malta': '🇲🇹',
  'Cyprus': '🇨🇾', 'Morocco': '🇲🇦', 'Nigeria': '🇳🇬', 'Kenya': '🇰🇪',
  'Ethiopia': '🇪🇹', 'Pakistan': '🇵🇰', 'Bangladesh': '🇧🇩',
  'Vietnam': '🇻🇳', 'Philippines': '🇵🇭', 'Taiwan': '🇹🇼',
  'Hong Kong': '🇭🇰', 'Qatar': '🇶🇦', 'Kuwait': '🇰🇼',
};

// ─── State ───────────────────────────────────────────────────
let map;
let currentPopup       = null;
let selectedIcao       = null;
let userMarker         = null;
let allFlights         = [];
let countdownVal       = REFRESH_INTERVAL_SECONDS;
let countdownTimer;
let searchDebounce;
let isFetching         = false;
let mapReady           = false;
let lastFetchTime      = 0;
let lastAnimUpdate     = 0;
const airborneHistory  = [];
const flightMap        = new Map();

// Persistent GeoJSON — mutated in place for performance
const planesGeoJSON = { type: 'FeatureCollection', features: [] };

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

// ─── Map Style ───────────────────────────────────────────────
const MAP_STYLE = {
  version: 8,
  name: 'SkyBoard Dark',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxzoom: 18,
    }
  },
  layers: [{
    id: 'carto-dark-layer',
    type: 'raster',
    source: 'carto-dark',
    minzoom: 0,
    maxzoom: 18,
  }],
};

// ─── Create Plane Icon (SDF) ─────────────────────────────────
function createPlaneImage() {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  const cx = size / 2;
  ctx.beginPath();
  // Airplane silhouette pointing north (up)
  ctx.moveTo(cx, 4);
  ctx.lineTo(cx + 4, 16);
  ctx.lineTo(cx + 18, 22);
  ctx.lineTo(cx + 4, 27);
  ctx.lineTo(cx + 6, 40);
  ctx.lineTo(cx, 36);
  ctx.lineTo(cx - 6, 40);
  ctx.lineTo(cx - 4, 27);
  ctx.lineTo(cx - 18, 22);
  ctx.lineTo(cx - 4, 16);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

// ─── Altitude Helpers ────────────────────────────────────────
function altBand(altMeters) {
  if (altMeters == null) return 'unknown';
  if (altMeters > 10000) return 'cruise';
  if (altMeters > 3000)  return 'climb';
  if (altMeters > 500)   return 'approach';
  return 'low';
}

function altitudeColor(altMeters) {
  if (altMeters == null) return '#8aa8c0';
  if (altMeters > 10000) return '#00d4ff';
  if (altMeters > 3000)  return '#ffd700';
  if (altMeters > 500)   return '#ff9f43';
  return '#ff6b6b';
}

// ─── Map Initialisation ──────────────────────────────────────
function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: MAP_STYLE,
    center: [0, 30],
    zoom: 2.5,
    minZoom: 1.5,
    maxZoom: 14,
    attributionControl: true,
  });

  map.on('load', onMapLoad);
}

function onMapLoad() {
  // Add plane icon as SDF image
  map.addImage('plane-icon', createPlaneImage(), { sdf: true });

  // Add GeoJSON source for planes
  map.addSource('planes', {
    type: 'geojson',
    data: planesGeoJSON,
  });

  // Add symbol layer for planes — single GPU draw call
  map.addLayer({
    id: 'planes-layer',
    type: 'symbol',
    source: 'planes',
    layout: {
      'icon-image': 'plane-icon',
      'icon-size': [
        'case',
        ['==', ['get', 'selected'], 1], 0.55,
        0.35
      ],
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-pitch-alignment': 'map',
    },
    paint: {
      'icon-color': [
        'case',
        ['==', ['get', 'selected'], 1], '#ffffff',
        ['==', ['get', 'band'], 'cruise'],   '#00d4ff',
        ['==', ['get', 'band'], 'climb'],    '#ffd700',
        ['==', ['get', 'band'], 'approach'], '#ff9f43',
        ['==', ['get', 'band'], 'low'],      '#ff6b6b',
        '#8aa8c0'
      ],
      'icon-opacity': [
        'case',
        ['==', ['get', 'selected'], 1], 1,
        0.85
      ],
    },
  });

  // Click handler for planes
  map.on('click', 'planes-layer', onPlaneClick);
  map.on('mouseenter', 'planes-layer', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'planes-layer', () => {
    map.getCanvas().style.cursor = '';
  });

  // Click on map (not plane) to close popup
  map.on('click', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['planes-layer'] });
    if (!features.length) {
      closePopup();
    }
  });

  mapReady = true;

  // Initial data load
  refresh(true);
  startCountdown();
  startAnimation();
}

// ─── Plane Click / Popup ─────────────────────────────────────
function onPlaneClick(e) {
  if (!e.features || !e.features.length) return;
  const props = e.features[0].properties;
  const icao24 = props.icao24;
  const entry = flightMap.get(icao24);
  if (!entry) return;

  // Update selection
  selectedIcao = icao24;
  rebuildGeoJSON();

  // Close existing popup
  closePopup();

  // Show new popup
  const f = entry.flight;
  const coords = [entry.current.lon, entry.current.lat];
  currentPopup = new maplibregl.Popup({ maxWidth: '300px', offset: 12 })
    .setLngLat(coords)
    .setHTML(buildPopupHtml(f))
    .addTo(map);

  currentPopup.on('close', () => {
    selectedIcao = null;
    currentPopup = null;
    rebuildGeoJSON();
  });
}

function closePopup() {
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
  }
  selectedIcao = null;
}

// ─── Popup HTML ──────────────────────────────────────────────
function buildPopupHtml(f) {
  const callsign = (f[IDX.CALLSIGN] || '').trim() || f[IDX.ICAO24] || 'Unknown';
  const country  = f[IDX.COUNTRY]   || 'Unknown';
  const altM     = f[IDX.BARO_ALT];
  const altFt    = altM != null ? Math.round(altM * 3.28084).toLocaleString() : '—';
  const velMs    = f[IDX.VELOCITY];
  const velKph   = velMs != null ? Math.round(velMs * 3.6).toLocaleString() : '—';
  const heading  = f[IDX.HEADING]   != null ? Math.round(f[IDX.HEADING]) + '°' : '—';
  const vrate    = f[IDX.VERT_RATE];
  const onGround = f[IDX.ON_GROUND];
  const squawk   = f[IDX.SQUAWK]    || '—';

  let vrateStr   = '— m/s';
  let vrateClass = 'vrate-level';
  if (vrate != null) {
    if (vrate > 0.5)       { vrateStr = '+' + vrate.toFixed(1) + ' m/s ↑'; vrateClass = 'vrate-climb'; }
    else if (vrate < -0.5) { vrateStr = vrate.toFixed(1) + ' m/s ↓';       vrateClass = 'vrate-desc';  }
    else                   { vrateStr = 'Level ↔';                          vrateClass = 'vrate-level'; }
  }

  const flag = COUNTRY_FLAGS[country] || '🌐';
  const vrateArrow = vrate == null ? '' :
    vrate > 0.5  ? '<span style="color:#00ff9d;font-size:0.9rem;">▲</span> ' :
    vrate < -0.5 ? '<span style="color:#ff4d6d;font-size:0.9rem;">▼</span> ' :
                   '<span style="color:#8aa8c0;font-size:0.9rem;">→</span> ';

  return '<div class="popup-callsign">' + vrateArrow + '✈️ ' + callsign + '</div>' +
    '<div class="popup-grid">' +
      '<div class="popup-item"><span class="popup-label">Country</span><span class="popup-value">' + flag + ' ' + country + '</span></div>' +
      '<div class="popup-item"><span class="popup-label">Status</span><span class="popup-value">' + (onGround ? '🛬 On Ground' : '🛫 Airborne') + '</span></div>' +
      '<div class="popup-item"><span class="popup-label">Altitude</span><span class="popup-value">' + altFt + ' ft</span></div>' +
      '<div class="popup-item"><span class="popup-label">Speed</span><span class="popup-value">' + velKph + ' km/h</span></div>' +
      '<div class="popup-item"><span class="popup-label">Heading</span><span class="popup-value">' + heading + '</span></div>' +
      '<div class="popup-item"><span class="popup-label">Vertical Rate</span><span class="popup-value ' + vrateClass + '">' + vrateStr + '</span></div>' +
      '<div class="popup-item"><span class="popup-label">ICAO24</span><span class="popup-value">' + (f[IDX.ICAO24] || '—') + '</span></div>' +
      '<div class="popup-item"><span class="popup-label">Squawk</span><span class="popup-value">' + squawk + '</span></div>' +
    '</div>';
}

// ─── Build / Rebuild GeoJSON ─────────────────────────────────
function rebuildGeoJSON() {
  planesGeoJSON.features = [];
  for (const [icao24, entry] of flightMap) {
    planesGeoJSON.features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [entry.current.lon, entry.current.lat],
      },
      properties: {
        icao24: icao24,
        heading: entry.heading || 0,
        band: entry.band,
        selected: icao24 === selectedIcao ? 1 : 0,
      },
    });
  }
  updateMapSource();
}

function updateMapSource() {
  if (!mapReady) return;
  const source = map.getSource('planes');
  if (source) source.setData(planesGeoJSON);
}

// ─── Process Incoming Data ───────────────────────────────────
function processFlightData(states) {
  const now = performance.now();
  lastFetchTime = now;
  const activeIcaos = new Set();

  for (const f of states) {
    const lat = f[IDX.LAT];
    const lon = f[IDX.LON];
    if (lat == null || lon == null) continue;

    const icao24 = f[IDX.ICAO24] || '';
    activeIcaos.add(icao24);

    const heading  = f[IDX.HEADING]  != null ? f[IDX.HEADING] : 0;
    const speed    = f[IDX.VELOCITY] != null ? f[IDX.VELOCITY] : 0;
    const band     = altBand(f[IDX.BARO_ALT]);

    const prev = flightMap.get(icao24);
    if (prev) {
      // Update existing — set start to current interpolated position
      prev.start   = { lat: prev.current.lat, lon: prev.current.lon };
      prev.target  = { lat, lon };
      prev.heading = heading;
      prev.speed   = speed;
      prev.band    = band;
      prev.flight  = f;
      prev.startTime = now;
    } else {
      // New plane
      flightMap.set(icao24, {
        start:   { lat, lon },
        target:  { lat, lon },
        current: { lat, lon },
        heading: heading,
        speed:   speed,
        band:    band,
        flight:  f,
        startTime: now,
      });
    }
  }

  // Remove planes no longer in data
  for (const icao24 of flightMap.keys()) {
    if (!activeIcaos.has(icao24)) {
      flightMap.delete(icao24);
    }
  }

  rebuildGeoJSON();
}

// ─── Interpolation Animation Loop ────────────────────────────
function startAnimation() {
  function animate(timestamp) {
    requestAnimationFrame(animate);

    // Throttle GeoJSON updates to ~20fps
    if (timestamp - lastAnimUpdate < ANIM_THROTTLE_MS) return;
    lastAnimUpdate = timestamp;

    if (flightMap.size === 0) return;

    let needsUpdate = false;

    for (const entry of flightMap.values()) {
      const elapsed = timestamp - entry.startTime;
      const t = Math.min(elapsed / INTERP_DURATION_MS, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);

      const newLat = entry.start.lat + (entry.target.lat - entry.start.lat) * eased;
      const newLon = entry.start.lon + (entry.target.lon - entry.start.lon) * eased;

      // After reaching target, extrapolate based on heading and speed
      let extraLat = newLat;
      let extraLon = newLon;
      if (t >= 1 && entry.speed > 0) {
        const extraSec = (elapsed - INTERP_DURATION_MS) / 1000;
        const degPerSec = entry.speed / 111320;
        const hdgRad = entry.heading * Math.PI / 180;
        extraLat = entry.target.lat + degPerSec * Math.cos(hdgRad) * extraSec;
        const cosLat = Math.cos(entry.target.lat * Math.PI / 180) || 1;
        extraLon = entry.target.lon + (degPerSec * Math.sin(hdgRad) / cosLat) * extraSec;
      }

      if (Math.abs(entry.current.lat - extraLat) > 0.00001 ||
          Math.abs(entry.current.lon - extraLon) > 0.00001) {
        entry.current.lat = extraLat;
        entry.current.lon = extraLon;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      // Update coordinates in place
      for (let i = 0; i < planesGeoJSON.features.length; i++) {
        const feat = planesGeoJSON.features[i];
        const entry = flightMap.get(feat.properties.icao24);
        if (entry) {
          feat.geometry.coordinates[0] = entry.current.lon;
          feat.geometry.coordinates[1] = entry.current.lat;
        }
      }
      updateMapSource();
    }
  }

  requestAnimationFrame(animate);
}

// ─── Fetch Flights ───────────────────────────────────────────
async function fetchFlights(bbox) {
  if (isFetching) return null;
  isFetching = true;

  let url = OPENSKY_URL;
  if (bbox) {
    const { lamin, lomin, lamax, lomax } = bbox;
    url += '?lamin=' + lamin + '&lomin=' + lomin + '&lamax=' + lamax + '&lomax=' + lomax;
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res  = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
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
    if (!states) return;
    allFlights = states;

    processFlightData(states);
    updateStats(states);

    aircraftCount.textContent = states.length.toLocaleString();

    // Fade out loading overlay
    if (showLoading) {
      loadingOverlay.style.transition = 'opacity 0.4s';
      loadingOverlay.style.opacity    = '0';
      setTimeout(() => { loadingOverlay.style.display = 'none'; }, 400);
    }
  } catch (err) {
    console.error('SkyBoard fetch error:', err);
    if (showLoading) loadingOverlay.style.display = 'none';
    errorMessage.textContent = 'Could not load flight data: ' + err.message + '. Check your connection and try again.';
    errorOverlay.classList.remove('hidden');
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

// ─── Countdown Timer ─────────────────────────────────────────
function startCountdown() {
  clearInterval(countdownTimer);
  countdownVal = REFRESH_INTERVAL_SECONDS;
  countdownEl.textContent = countdownVal + 's';

  countdownTimer = setInterval(() => {
    countdownVal--;
    countdownEl.textContent = countdownVal + 's';
    if (countdownVal <= 0) {
      refresh(false);
      countdownVal = REFRESH_INTERVAL_SECONDS;
    }
  }, 1000);
}

// ─── Stats Panel ─────────────────────────────────────────────
function updateStats(flights) {
  const airborne = flights.filter(f => !f[IDX.ON_GROUND]);

  animateNumber('stat-airborne', airborne.length.toLocaleString());

  airborneHistory.push(airborne.length);
  if (airborneHistory.length > 10) airborneHistory.shift();
  renderSparkline(airborneHistory);

  // Fastest
  let fastest = null;
  for (const f of airborne) {
    if (f[IDX.VELOCITY] != null && (!fastest || f[IDX.VELOCITY] > fastest[IDX.VELOCITY])) {
      fastest = f;
    }
  }
  if (fastest) {
    const call = (fastest[IDX.CALLSIGN] || '').trim() || fastest[IDX.ICAO24] || '?';
    const spd  = Math.round(fastest[IDX.VELOCITY] * 3.6);
    animateNumber('stat-fastest', call + ' — ' + spd.toLocaleString() + ' km/h');
  } else {
    animateNumber('stat-fastest', '—');
  }

  // Highest altitude
  let highest = null;
  for (const f of airborne) {
    if (f[IDX.BARO_ALT] != null && (!highest || f[IDX.BARO_ALT] > highest[IDX.BARO_ALT])) {
      highest = f;
    }
  }
  if (highest) {
    const call = (highest[IDX.CALLSIGN] || '').trim() || highest[IDX.ICAO24] || '?';
    const alt  = Math.round(highest[IDX.BARO_ALT] * 3.28084);
    animateNumber('stat-highest', call + ' — ' + alt.toLocaleString() + ' ft');
  } else {
    animateNumber('stat-highest', '—');
  }

  // Most common country
  const countryCounts = {};
  for (const f of airborne) {
    const c = f[IDX.COUNTRY] || 'Unknown';
    countryCounts[c] = (countryCounts[c] || 0) + 1;
  }
  const topCountry = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCountry) {
    const flag = COUNTRY_FLAGS[topCountry[0]] || '🌐';
    animateNumber('stat-country', flag + ' ' + topCountry[0] + ' (' + topCountry[1] + ')');
  } else {
    animateNumber('stat-country', '—');
  }

  // Descending
  const descending = airborne.filter(f => f[IDX.VERT_RATE] != null && f[IDX.VERT_RATE] < -0.5).length;
  animateNumber('stat-descending', descending.toLocaleString());

  updateLeaderboard(countryCounts);
}

// ─── Leaderboard ─────────────────────────────────────────────
function updateLeaderboard(countryCounts) {
  const top10 = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (!top10.length) {
    lbList.innerHTML = '<li class="lb-placeholder">No data</li>';
    return;
  }

  const maxCount = top10[0][1];
  lbList.innerHTML = top10.map(function(entry, i) {
    const country = entry[0];
    const count = entry[1];
    const flag    = COUNTRY_FLAGS[country] || '🌐';
    const rank    = i + 1;
    const rankCls = rank <= 3 ? 'top3' : '';
    const barW    = Math.round((count / maxCount) * 100);
    return '<li class="lb-item">' +
      '<span class="lb-rank ' + rankCls + '">' + rank + '</span>' +
      '<span class="lb-flag">' + flag + '</span>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<span class="lb-name">' + country + '</span>' +
          '<span class="lb-count">' + count.toLocaleString() + '</span>' +
        '</div>' +
        '<div class="lb-bar" style="width:' + barW + '%"></div>' +
      '</div>' +
    '</li>';
  }).join('');
}

// ─── Animate Number Helper ───────────────────────────────────
function animateNumber(elId, newText) {
  const el = $(elId);
  if (!el) return;
  el.style.opacity = '0.4';
  requestAnimationFrame(function() {
    el.textContent = newText;
    el.style.transition = 'opacity 0.3s';
    el.style.opacity    = '1';
  });
  const statItem = el.closest('.stat-item');
  if (statItem) {
    statItem.classList.remove('stat-flash');
    void statItem.offsetWidth;
    statItem.classList.add('stat-flash');
  }
}

// ─── Sparkline ───────────────────────────────────────────────
function renderSparkline(data) {
  const el = $('sparkline');
  if (!el || data.length < 2) return;
  const w = 260, h = 28;
  const min = Math.min.apply(null, data), max = Math.max.apply(null, data);
  const range = max - min || 1;
  const pts = data.map(function(v, i) {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return x + ',' + y;
  }).join(' ');
  const lastY = h - ((data[data.length - 1] - min) / range) * (h - 4) - 2;
  el.innerHTML = '<polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + w + '" cy="' + lastY + '" r="3" fill="var(--accent)"/>';
}

// ─── Search ──────────────────────────────────────────────────
function doSearch(query) {
  query = (query || '').trim().toUpperCase();
  searchResult.className = 'search-result';

  if (!query) {
    searchResult.classList.add('hidden');
    return;
  }

  const found = allFlights.find(function(f) {
    const cs = (f[IDX.CALLSIGN] || '').trim().toUpperCase();
    return cs === query || cs.startsWith(query);
  });

  if (found) {
    const lat = found[IDX.LAT];
    const lon = found[IDX.LON];
    const cs  = (found[IDX.CALLSIGN] || '').trim() || found[IDX.ICAO24] || '?';

    if (lat != null && lon != null) {
      map.flyTo({ center: [lon, lat], zoom: 7, duration: 1500 });

      // Show popup for the found plane
      const icao24 = found[IDX.ICAO24] || '';
      selectedIcao = icao24;
      rebuildGeoJSON();

      closePopup();
      currentPopup = new maplibregl.Popup({ maxWidth: '300px', offset: 12 })
        .setLngLat([lon, lat])
        .setHTML(buildPopupHtml(found))
        .addTo(map);

      currentPopup.on('close', function() {
        selectedIcao = null;
        currentPopup = null;
        rebuildGeoJSON();
      });
    }

    const alt = found[IDX.BARO_ALT] != null
      ? Math.round(found[IDX.BARO_ALT] * 3.28084).toLocaleString() + ' ft'
      : '—';
    const spd = found[IDX.VELOCITY] != null
      ? Math.round(found[IDX.VELOCITY] * 3.6).toLocaleString() + ' km/h'
      : '—';

    searchResult.innerHTML = '<strong style="color:var(--accent)">✈️ ' + cs + '</strong><br>' +
      (found[IDX.COUNTRY] || '—') + ' &nbsp;·&nbsp; ' + alt + ' &nbsp;·&nbsp; ' + spd;
  } else {
    searchResult.classList.add('not-found');
    searchResult.textContent = 'No aircraft matching "' + query + '" found.';
  }
}

// ─── Haversine Distance ──────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = function(x) { return x * Math.PI / 180; };
  const dLat  = toRad(lat2 - lat1);
  const dLon  = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Cardinal Bearing ────────────────────────────────────────
function bearing(lat1, lon1, lat2, lon2) {
  const toRad = function(x) { return x * Math.PI / 180; };
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
    async function(pos) {
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

        if (!states || !states.length) {
          nearmeResult.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;">No flights found in your area right now.</div>';
          nearmeResult.classList.remove('hidden');
          nearmeBtn.disabled    = false;
          nearmeBtn.textContent = 'Planes Near Me 📡';
          return;
        }

        const nearby = states
          .filter(function(f) { return !f[IDX.ON_GROUND] && f[IDX.LAT] != null && f[IDX.LON] != null; })
          .map(function(f) {
            return {
              flight: f,
              dist:   haversine(userLat, userLon, f[IDX.LAT], f[IDX.LON]),
              dir:    bearing(userLat, userLon, f[IDX.LAT], f[IDX.LON]),
            };
          })
          .filter(function(x) { return x.dist <= 200; })
          .sort(function(a, b) { return a.dist - b.dist; })
          .slice(0, 20);

        if (!nearby.length) {
          nearmeResult.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;">No airborne flights within 200 km of you right now.</div>';
        } else {
          const items = nearby.map(function(item) {
            const f = item.flight, dist = item.dist, dir = item.dir;
            const cs  = (f[IDX.CALLSIGN] || '').trim() || f[IDX.ICAO24] || '?';
            const alt = f[IDX.BARO_ALT] != null
              ? Math.round(f[IDX.BARO_ALT] * 3.28084).toLocaleString() + ' ft'
              : '—';
            const spd = f[IDX.VELOCITY] != null
              ? Math.round(f[IDX.VELOCITY] * 3.6).toLocaleString() + ' km/h'
              : '—';
            return '<div class="nearme-item">' +
              '<span class="nearme-callsign">✈️ ' + cs + '</span>' +
              '<span class="nearme-detail">' + (f[IDX.COUNTRY] || '—') + ' &nbsp;·&nbsp; ' + alt + ' &nbsp;·&nbsp; ' + spd + '</span>' +
              '<span class="nearme-detail">' + Math.round(dist) + ' km ' + dir + ' of you</span>' +
            '</div>';
          }).join('');

          nearmeResult.innerHTML = '<div class="nearme-summary">' + nearby.length + ' plane' + (nearby.length !== 1 ? 's' : '') + ' within ~200km of you</div>' + items;
        }

        nearmeResult.classList.remove('hidden');

        // Pan map to user location
        map.flyTo({ center: [userLon, userLat], zoom: 7, duration: 1500 });

        // Add user location marker
        if (userMarker) userMarker.remove();
        const el = document.createElement('div');
        el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#00ff9d;border:2px solid #fff;box-shadow:0 0 12px #00ff9d;';
        userMarker = new maplibregl.Marker({ element: el })
          .setLngLat([userLon, userLat])
          .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML('<b>📍 You are here</b>'))
          .addTo(map);
        userMarker.togglePopup();

      } catch (err) {
        showNearmeError('Could not fetch nearby flights: ' + err.message);
      }

      nearmeBtn.disabled    = false;
      nearmeBtn.textContent = 'Planes Near Me 📡';
    },
    function(err) {
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
  nearmeResult.innerHTML = '<div style="color:var(--danger);font-size:0.82rem;">⚠️ ' + msg + '</div>';
  nearmeResult.classList.remove('hidden');
  nearmeBtn.disabled    = false;
  nearmeBtn.textContent = 'Planes Near Me 📡';
}

// ─── Leaderboard collapse toggle ─────────────────────────────
lbToggle.addEventListener('click', function() {
  const collapsed = lbContent.classList.toggle('collapsed');
  lbToggle.textContent    = collapsed ? '▼' : '▲';
  lbToggle.setAttribute('aria-expanded', String(!collapsed));
});

// ─── Event Listeners ─────────────────────────────────────────
refreshBtn.addEventListener('click', function() {
  refresh(false);
  startCountdown();
});

retryBtn.addEventListener('click', function() {
  errorOverlay.classList.add('hidden');
  refresh(true);
});

nearmeBtn.addEventListener('click', findNearMe);

searchInput.addEventListener('input', function() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(function() { doSearch(searchInput.value); }, SEARCH_DEBOUNCE_MS);
});

$('search-btn').addEventListener('click', function() {
  doSearch(searchInput.value);
});

searchInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doSearch(searchInput.value);
  if (e.key === 'Escape') {
    searchResult.classList.add('hidden');
    searchInput.value = '';
  }
});

document.addEventListener('click', function(e) {
  if (!e.target.closest('.search-wrapper')) {
    searchResult.classList.add('hidden');
  }
});

// ─── Radar Sweep Decoration ──────────────────────────────────
function initRadarSweep() {
  const canvas = $('radar-sweep');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let angle = 0;

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const r  = Math.max(cx, cy) * 1.4;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const sweep = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    sweep.addColorStop(0,   'rgba(57,255,20,0.5)');
    sweep.addColorStop(0.6, 'rgba(57,255,20,0.1)');
    sweep.addColorStop(1,   'rgba(57,255,20,0)');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, -0.18, 0.18);
    ctx.closePath();
    ctx.fillStyle = sweep;
    ctx.fill();
    ctx.restore();
    angle += 0.004;
    requestAnimationFrame(draw);
  }
  draw();
}

// ─── Boot ─────────────────────────────────────────────────────
(function init() {
  initMap();
  initRadarSweep();
})();
