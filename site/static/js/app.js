let RABBI_SCALE = 0.65;
let SHOW_RABBI_NAMES = true;
const MOVE_DURATION = 320;

const CITY_MIN_ZOOM = 6;
const SHUL_MIN_ZOOM = 7;
const RABBI_MIN_ZOOM = 8;

const bordersEuropeEnhanced = {};
const rabbiSearchInput = document.getElementById("rabbiSearchInput");
const rabbiSearchButton = document.getElementById("rabbiSearchButton");
const rabbiSearchList = document.getElementById("rabbiSearchList");
const toggleRabbiNames = document.getElementById("toggleRabbiNames");
let colors = {};
let YEARS = [];
let CITIES = [];
let BATTLES = [];
let EVENTS = [];
let RABBIS = [];
let RABBIS_MOV = {};
let PERSONALITIES = [];
let PERSONALITIES_MOV = {};
let SHULS = [];
let SHULS_MOV = {};
let BIBLE_PLACES = [];

let layer = null;
let currentBorderYear = null;
let currentYear = null;
let ACTIVE_YEARS = [];
let currentIndex = 0;
let showToken = 0;
let sliderTimer = null;
let eventPanelOpen = false;
let lastEventsList = [];
let storyTimer = null;
let currentStoryIndex = 0;
let currentStoryEvents = [];
let storyMarker = null;
let storyLine = null;
let storyPaused = false;
const entityColors = {};

const yearBox = document.getElementById("year");
const slider = document.getElementById("slider");
const fromInput = document.getElementById("fromYear");
const toInput = document.getElementById("toYear");
const applyBtn = document.getElementById("applyRange");
const eventToggle = document.getElementById("eventToggle");
const eventBox = document.getElementById("eventBox");
const rabbiSizeSlider = document.getElementById("rabbiSizeSlider");

const filters = {
  rabbis: document.getElementById("toggleRabbis"),
  shuls: document.getElementById("toggleShuls"),
  personalities: document.getElementById("togglePersonalities"),
  battles: document.getElementById("toggleBattles"),
  events: document.getElementById("toggleEvents"),
  rabbiEvents: document.getElementById("toggleRabbiEvents")
};

function setLayerClickable(marker, clickable) {
  if (!marker) return;
  const el = marker.getElement?.();
  if (el) el.style.pointerEvents = clickable ? "auto" : "none";
}

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return await response.json();
}
const EVENT_FILES = [
  "data/events.json",

  "eventsgrouped/sefarim.json",
  "eventsgrouped/Pogroms.json",
  "eventsgrouped/JewishTowns.json",
  "eventsgrouped/Regions.json",
  "eventsgrouped/Concentration.json",
  "eventsgrouped/HolocaustAnimate.json",
  "eventsgrouped/HolocaustStatic.json",
  "eventsgrouped/Statistics.json",
  "eventsgrouped/Zionist.json"
];

async function loadAllEvents() {
  const results = await Promise.all(
    EVENT_FILES.map(async path => {
      try {
        return await loadJSON(path);
      } catch (err) {
        console.warn("Could not load:", path, err);
        return [];
      }
    })
  );

  return results.flat();
}
async function loadInitialData() {
  [
    colors,
    YEARS,
    CITIES,
    BATTLES,
    EVENTS,
    RABBIS,
    RABBIS_MOV,
    PERSONALITIES,
    PERSONALITIES_MOV,
    SHULS,
    SHULS_MOV,
    BIBLE_PLACES
  ] = await Promise.all([
    loadJSON("data/colors.json"),
    loadJSON("data/years.json"),
    loadJSON("data/cities.json"),
    loadJSON("data/battles.json"),

    loadAllEvents(),

    loadJSON("data/rabbis.json"),
    loadJSON("data/rabbis_movement.json"),
    loadJSON("data/personalities.json"),
    loadJSON("data/personalities_movement.json"),
    loadJSON("data/shuls.json"),
    loadJSON("data/shuls_movement.json"),
    loadJSON("data/bible_places.json")
  ]);

  console.log("Loaded events:", EVENTS.length);
}

async function tryLoadBordersForYear(year) {
  if (bordersEuropeEnhanced[year]) return bordersEuropeEnhanced[year];

  try {
    const borderData = await loadJSON(`data/borders/${year}.geojson`);
    bordersEuropeEnhanced[year] = borderData;
    return borderData;
  } catch {
    return null;
  }
}

async function findAvailableBorderYear(year) {
  const requested = Number(year);

  const candidates = (ACTIVE_YEARS.length ? ACTIVE_YEARS : YEARS)
    .map(Number)
    .filter(y => Number.isFinite(y) && y <= requested)
    .sort((a, b) => b - a);

  for (const candidate of candidates) {
    const border = await tryLoadBordersForYear(candidate);
    if (border) return candidate;
  }

  const earliestCandidates = YEARS
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  for (const candidate of earliestCandidates) {
    const border = await tryLoadBordersForYear(candidate);
    if (border) return candidate;
  }

  return null;
}

function preloadNearbyBorders(index) {
  [index - 1, index + 1].forEach(i => {
    if (i >= 0 && i < ACTIVE_YEARS.length) {
      findAvailableBorderYear(ACTIVE_YEARS[i]).catch(() => {});
    }
  });
}

const map = L.map("map", {
  center: [52, 10],
  zoom: 4,
  zoomAnimation: true,
  markerZoomAnimation: false,
  fadeAnimation: true
});

map.createPane("bordersPane").style.zIndex = 200;
map.createPane("shulsPane").style.zIndex = 600;

map.createPane("rabbisPane");
map.getPane("rabbisPane").style.zIndex = 680;
map.getPane("rabbisPane").style.pointerEvents = "auto";

map.createPane("sefarimPane");
map.getPane("sefarimPane").style.zIndex = 690;
map.getPane("sefarimPane").style.pointerEvents = "auto";

map.getPane("popupPane").style.zIndex = 1000;
map.getPane("tooltipPane").style.zIndex = 995;

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 3
  }
).addTo(map);

function animateMarker(marker, from, to, duration = MOVE_DURATION) {
  if (!from || !to) return;

  const start = performance.now();

  function step(timestamp) {
    const t = Math.min(1, (timestamp - start) / duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    marker.setLatLng([
      from[0] + (to[0] - from[0]) * eased,
      from[1] + (to[1] - from[1]) * eased
    ]);

    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// ===== Country colour controls =====
// Change these numbers to tune the map appearance.

const COUNTRY_COLOUR_SETTINGS = {
  // 0 = original strong colour
  // 1 = almost white
  // Good range: 0.15–0.45
  whitenAmount: 0.15,

  // Main colour visibility.
  // Higher = stronger country colours.
  // Good range: 0.20–0.45
  fillOpacity: 0.22,

  // Border thickness.
  // Good range: 0.4–1.2
  borderWeight: 0.6,

  // Border darkness.
  // Higher final number = darker border.
  // Good range: 0.35–0.7
  borderColour: "rgba(0,0,0,0.5)",

  // Colour used when no country colour is found.
  fallbackColour: "rgba(180,180,180,0.25)"
};

function softCountryColor(name) {
  const base = colors[name];

  if (!base) {
    return COUNTRY_COLOUR_SETTINGS.fallbackColour;
  }

  const match = String(base).match(/\d+/g);

  if (!match || match.length < 3) {
    return base;
  }

  const [r, g, b] = match.map(Number);
  const mix = COUNTRY_COLOUR_SETTINGS.whitenAmount;

  const sr = Math.round(r + (255 - r) * mix);
  const sg = Math.round(g + (255 - g) * mix);
  const sb = Math.round(b + (255 - b) * mix);

  return `rgb(${sr},${sg},${sb})`;
}

function colour(f) {
  const n =
    f.properties?.Name ||
    f.properties?.NAME ||
    f.properties?.name ||
    f.properties?.admin;

  return {
    color: COUNTRY_COLOUR_SETTINGS.borderColour,
    weight: COUNTRY_COLOUR_SETTINGS.borderWeight,
    fillOpacity: COUNTRY_COLOUR_SETTINGS.fillOpacity,
    fillColor: softCountryColor(n)
  };
}

function getPosition(movement, year) {
  let last = null;
  const y = Number(year);

  for (const m of movement || []) {
    if (Number(m.year) <= y) last = m;
    else break;
  }

  return last ? last.latlng : null;
}

function getAgeText(entity, year) {
  const birth = Number(entity.birth_year);
  const death = entity.death_year === undefined || entity.death_year === null || entity.death_year === ""
    ? null
    : Number(entity.death_year);

  const y = Number(year);

  if (!Number.isFinite(birth) || !Number.isFinite(y) || y < birth) return "";

  if (death && Number.isFinite(death) && y >= death) {
    return `died aged ${death - birth}`;
  }

  return `age ${y - birth}`;
}

function getYearsText(entity) {
  if (!entity.birth_year) return "";
  return `${entity.birth_year}${entity.death_year ? "–" + entity.death_year : ""}`;
}

function buildPopup(content) {
  return `<div style="background:#eee;padding:6px 10px;border-radius:6px;font-style:italic;max-width:250px;">${content}</div>`;
}

function getEntityColor(name) {
  if (!entityColors[name]) {
    const h = Math.abs(String(name).split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
    entityColors[name] = `hsl(${h},70%,45%)`;
  }

  return entityColors[name];
}

function getDisplayName(r, y) {
  const parts = [];

  if (Array.isArray(r.titles)) {
    const match = r.titles.find(t => Number(y) >= Number(t.start) && Number(y) <= Number(t.end));
    if (match && match.title) parts.push(match.title);
  }

  if (r.title) parts.push(r.title);
  parts.push(r.base_name || r.name);

  return parts.join(" ");
}

function buildEntityPopup(entities, year) {
  const y = Number(year);

  if (entities.length > 1) {
    const imgRow = entities.map((r, idx) => {
      const imgSrc = r.img || r.image || "";
      if (!imgSrc) return "";

      return `<img src="${imgSrc}"
                   title="${getDisplayName(r, y)}"
                   class="rabbi-popup-img"
                   data-rabbi-index="${idx}"
                   style="width:70px;height:70px;object-fit:cover;border-radius:50%;border:1px solid #333;margin:0 4px;cursor:pointer;">`;
    }).join("");

    const details = entities.map(r => {
      const yearsStr = getYearsText(r);
      const ageText = getAgeText(r, y);

      return `
        <div style="margin-top:6px;">
          <strong>${getDisplayName(r, y)}</strong><br>
          ${yearsStr}${ageText ? " — " + ageText : ""}<br>
          ${r.bio || ""}
        </div>
      `;
    }).join("<hr>");

    return buildPopup(`
      <div style="text-align:center;margin-bottom:8px;">${imgRow}</div>
      ${details}
    `);
  }

  const r = entities[0];
  const imgSrc = r.img || r.image || "";
  const imgHtml = imgSrc ? `<div style="margin-bottom:6px;">
    <img src="${imgSrc}" style="max-width:150px;max-height:150px;border-radius:8px;border:1px solid #333;">
  </div>` : "";

  const yearsStr = getYearsText(r);
  const ageText = getAgeText(r, y);

  return buildPopup(`
    ${imgHtml}
    <strong>${getDisplayName(r, y)}</strong><br>
    ${yearsStr}${ageText ? " — " + ageText : ""}<br>
    ${r.bio || ""}
  `);
}

function buildSingleHTML(r, y) {
  const color = getEntityColor(r.name);
  const imgSrc = r.img || r.image || "";
  const ageText = getAgeText(r, y);
  const ageLabel = ageText && ageText.startsWith("age ") ? ` (${ageText.replace("age ", "")})` : "";

  const imageSize = 40 * RABBI_SCALE;
  const dotSize = 20 * RABBI_SCALE;

  const baseImg = imgSrc
    ? `<img src="${imgSrc}" class="rabbi-single-img"
             style="pointer-events:auto;cursor:pointer;width:${imageSize}px;height:${imageSize}px;object-fit:cover;border-radius:50%;border:1px solid #333;">`
    : `<div class="rabbi-single-img"
             style="pointer-events:auto;cursor:pointer;width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${color};"></div>`;

const nameHtml = SHOW_RABBI_NAMES
  ? `<div class="rabbi-label rabbi-single-name" style="pointer-events:auto;cursor:pointer;background:${color};white-space:nowrap;font-size:${Math.max(2, 9 * RABBI_SCALE)}px !important;
line-height:1.1;padding:${1.5 * RABBI_SCALE}px ${5 * RABBI_SCALE}px;">
      ${getDisplayName(r, y)}${ageLabel}
    </div>`
  : "";

return `<div style="display:flex;flex-direction:column;align-items:center;gap:${2 * RABBI_SCALE}px;">
  ${baseImg}
  ${nameHtml}
</div>`;
}

function buildGroupHTML(rs, y) {
  const groupSize = 40 * RABBI_SCALE;

  const baseImg = `<img src="https://upload.wikimedia.org/wikipedia/commons/8/81/%D7%99%D7%A9%D7%99%D7%91%D7%AA_%D7%94%D7%A0%D7%98%D7%A2_%D7%A9%D7%95%D7%A8%D7%A7_%D7%9E%D7%98%D7%A9%D7%90%D7%98%D7%90_%D7%A8%D7%91%D7%99_%D7%A9%D7%A8%D7%92%D7%90_%D7%A6%D7%91%D7%99_%D7%98%D7%A2%D7%A0%D7%A2%D7%A0%D7%91%D7%95%D7%99%D7%9D.jpg"
    class="rabbi-group-img"
    style="pointer-events:auto;cursor:pointer;width:${groupSize}px;height:${groupSize}px;object-fit:cover;border-radius:50%;border:1px solid #333;">`;

let namesHTML = SHOW_RABBI_NAMES
  ? `<div class="stacked-names" style="display:flex;flex-direction:column;align-items:center;margin-top:${4 * RABBI_SCALE}px;">`
  : "";

  rs.forEach((r, idx) => {
    const color = getEntityColor(r.name);
    const ageText = getAgeText(r, y);
    const ageLabel = ageText && ageText.startsWith("age ") ? ` (${ageText.replace("age ", "")})` : "";

    if (SHOW_RABBI_NAMES) {
  namesHTML += `<div class="rabbi-label rabbi-name"
      data-rabbi-index="${idx}"
      style="pointer-events:auto;cursor:pointer;background:${color};white-space:nowrap;font-size:${Math.max(2, 9 * RABBI_SCALE)}px !important;
line-height:1.1;">
      ${getDisplayName(r, y)}${ageLabel}
    </div>`;
  }});

  if (SHOW_RABBI_NAMES) {
  namesHTML += `</div>`;
}

  return `<div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:${2 * RABBI_SCALE}px;">
    ${baseImg}${namesHTML}
  </div>`;
}

async function drawBorders(y, token) {
  const validYear = await findAvailableBorderYear(y);
  if (token !== showToken) return false;
  if (validYear === null) return true;

  const borderData = bordersEuropeEnhanced[validYear];
  if (!borderData) return true;

  if (validYear !== currentBorderYear) {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);

    layer = L.geoJSON(borderData, {
      pane: "bordersPane",
      style: colour,
      renderer: L.canvas(),
      interactive: true,
      onEachFeature: (f, lyr) => {
        const name = f.properties?.Name || f.properties?.NAME || f.properties?.name || f.properties?.admin || "Unknown";

        lyr.bindTooltip(name, {
          sticky: true,
          direction: "top",
          opacity: 0.96,
          className: "country-tooltip"
        });

        lyr.on({
          mouseover: e => {
            e.target.setStyle({
              weight: 1.8,
              color: "rgba(0,0,0,0.9)",
              fillOpacity: 0.42
            });
            e.target.openTooltip(e.latlng);
          },
          mouseout: e => {
            if (layer) layer.resetStyle(e.target);
            e.target.closeTooltip();
          },
          click: e => {
            lyr.bindPopup(`<b>${name}</b>`).openPopup(e.latlng);
          }
        });
      }
    });

    layer.addTo(map);
    currentBorderYear = validYear;
  }

  return true;
}

function drawCities(y) {
  CITIES.forEach(c => {
    if (!c._marker) {
      c._marker = L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: "city", html: c.name, iconSize: [100, 20] }),
        interactive: false,
        keyboard: false
      }).addTo(map);
    }

    const visible = Number(c.founding) <= Number(y) && map.getZoom() >= CITY_MIN_ZOOM;
    c._marker.setOpacity(visible ? 1 : 0);
  });
}

function drawBattles(y, eventsList) {
  BATTLES.forEach(b => {
    if (!b._marker) {
      b._marker = L.marker([b.lat, b.lng], {
        icon: L.divIcon({ html: "⚔️", className: "", iconSize: [24, 24] }),
        zIndexOffset: 5000,
        keyboard: false
      })
        .bindPopup(buildPopup(`<strong>${b.name}</strong><br>${b.note || b.event || ""}`))
        .addTo(map);
    }

    if (!b._label) {
      b._label = L.marker([b.lat, b.lng], {
        icon: L.divIcon({ className: "label-text", html: b.name, iconSize: null }),
        interactive: false,
        zIndexOffset: 5000,
        keyboard: false
      }).addTo(map);
    }

    const visible = filters.battles.checked && Number(b.year) === Number(y);

    b._marker.setOpacity(visible ? 1 : 0);
    b._label.setOpacity(visible ? 1 : 0);

    if (visible) eventsList.push(`⚔️ ${b.name} — ${b.note || b.event || ""}`);
  });
}

function drawEvents(y, eventsList) {
  EVENTS.forEach(ev => {
    const isSefarim = ev.source === "sefarim" || (ev.name && ev.name.includes("📖"));
    const paneName = isSefarim ? "sefarimPane" : "markerPane";

    if (ev.lat && ev.lng && !ev._marker) {
      const iconHTML = ev.emoji
        ? `<div style="font-size:28px;">${ev.emoji}</div>`
        : ev.img
          ? `<img src="${ev.img}" style="width:30px;height:30px;object-fit:contain;">`
          : `<div style="font-size:20px;">📍</div>`;

ev._marker = L.marker([ev.lat, ev.lng], {
  pane: paneName,
  zIndexOffset: isSefarim ? 10000 : 0,
  icon: L.divIcon({
    html: iconHTML,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  }),
  keyboard: false
}).addTo(map);
    }

    if (ev.lat && ev.lng && !ev._label) {
      ev._label = L.marker([ev.lat, ev.lng], {
        pane: paneName,
        zIndexOffset: isSefarim ? 10000 : 0,
        icon: L.divIcon({
          className: "label-text",
          html: ev.name,
          iconSize: [160, 24],
          iconAnchor: [80, -8]
        }),
        interactive: true,
        keyboard: false
      }).addTo(map);
    }

    let inRange = false;
    const start = Number(ev.start_year);
    const end = Number(ev.end_year);

    if (ev.year !== undefined) {
      inRange = Number(y) === Number(ev.year);
    } else if (!Number.isNaN(start) && !Number.isNaN(end)) {
      inRange = Number(y) >= start && Number(y) <= end;
    }

    const visible = inRange && filters.events.checked;

    if (ev._marker) {
      ev._marker.setOpacity(visible ? 1 : 0);
      setLayerClickable(ev._marker, visible);
      if (visible) ev._marker.bindPopup(`<strong>${ev.name}</strong><br>${ev.note || ev.event || ""}`);
      else ev._marker.unbindPopup();
    }

    if (ev._label) {
      ev._label.setOpacity(visible ? 1 : 0);
      setLayerClickable(ev._label, visible);
      if (visible) ev._label.bindPopup(`<strong>${ev.name}</strong><br>${ev.note || ev.event || ""}`);
      else ev._label.unbindPopup();
    }

    if (ev._polygon) {
      ev._polygon.setStyle({ opacity: visible ? 1 : 0, fillOpacity: visible ? 0.2 : 0 });
    }

    if (visible) eventsList.push(`${ev.emoji || "📍"} ${ev.name} — ${ev.note || ev.event || ""}`);
  });
}

function drawShuls(y, animate, eventsList) {
  SHULS.forEach(s => {
    if (!s._marker) {
      const color = getEntityColor(s.name);
      const SHUL_IMG_SIZE = 60;

      const iconHTML = s.img
        ? `<img src="${s.img}" style="width:${SHUL_IMG_SIZE}px;height:${SHUL_IMG_SIZE}px;border-radius:6px;border:1px solid #333;">`
        : s.emoji
          ? `<div style="font-size:${SHUL_IMG_SIZE * 0.6}px;line-height:1;">${s.emoji}</div>`
          : `<div style="width:${SHUL_IMG_SIZE}px;height:${SHUL_IMG_SIZE}px;background:${color};border-radius:6px;border:1px solid #333;"></div>`;

      s._marker = L.marker([0, 0], {
        pane: "shulsPane",
        keyboard: false,
        icon: L.divIcon({
          html: `<div style="pointer-events:none;display:flex;flex-direction:column;align-items:center;">
            <div class="rabbi-label" style="pointer-events:auto;cursor:pointer;position:absolute;top:-22px;background:#ddd;color:#000;white-space:nowrap;">
              ${s.name}
            </div>
            <div style="pointer-events:none;">${iconHTML}</div>
          </div>`,
          className: "",
          iconSize: [SHUL_IMG_SIZE, SHUL_IMG_SIZE],
          iconAnchor: [SHUL_IMG_SIZE / 2, SHUL_IMG_SIZE / 2]
        })
      })
        .bindPopup(() => buildEntityPopup([s], currentYear))
        .addTo(map);
    }

    const alive = Number(y) >= Number(s.birth_year) && Number(y) <= Number(s.death_year);
    const moves = SHULS_MOV[s.name] || [];
    const pos = getPosition(moves, y) || (s.lat && s.lng ? [s.lat, s.lng] : null);
    const visible = alive && pos && filters.shuls.checked && map.getZoom() >= SHUL_MIN_ZOOM;

    if (visible) {
      const oldPos = s._marker.getLatLng();

      if (animate && oldPos && !map._isZoomingNow) {
        animateMarker(s._marker, [oldPos.lat, oldPos.lng], pos);
      } else {
        s._marker.setLatLng(pos);
      }

      s._marker.setOpacity(1);
      s._marker._displayYear = y;
      setLayerClickable(s._marker, true);

      const moveEvent = moves.find(mv => Number(mv.year) === Number(y) && mv.event);
      if (moveEvent) eventsList.push(`⛪ ${s.name} — ${moveEvent.event}`);
    } else {
      s._marker.setOpacity(0);
      s._marker.closePopup?.();
      setLayerClickable(s._marker, false);
    }
  });
}

function renderRabbis(y, animate) {
  const arrivals = [];

  RABBIS.concat(PERSONALITIES).forEach(r => {
    const isRabbi = RABBIS.includes(r);
    const isPersonality = PERSONALITIES.includes(r);
    const alive = Number(y) >= Number(r.birth_year) && (!r.death_year || Number(y) <= Number(r.death_year));
    const moves = (RABBIS_MOV[r.name] || []).concat(PERSONALITIES_MOV[r.name] || []);
    const pos = getPosition(moves, y) || (r.lat && r.lng ? [r.lat, r.lng] : null);
    const visible = alive && pos && ((isRabbi && filters.rabbis.checked) || (isPersonality && filters.personalities.checked));

    if (visible) {
      if (!r._marker) {
        r._marker = L.marker(pos, {
          pane: "rabbisPane",
          icon: L.divIcon({ html: "", className: "rabbi-img-icon" }),
          keyboard: false
        })
          .bindPopup(() => buildEntityPopup([r], r._marker?._displayYear || currentYear))
          .addTo(map);
      }

      const oldPos = r._marker.getLatLng();

      if (animate && oldPos && !map._isZoomingNow) {
        animateMarker(r._marker, [oldPos.lat, oldPos.lng], pos);
      } else {
        r._marker.setLatLng(pos);
      }

      r._marker.setOpacity(1);
      r._marker._displayYear = y;
      setLayerClickable(r._marker, true);

      r._marker.bindPopup(() => buildEntityPopup([r], r._marker?._displayYear || currentYear));

      const moveEvent = moves.find(mv => Number(mv.year) === Number(y) && mv.event);

      if (moveEvent && map.getZoom() >= RABBI_MIN_ZOOM && filters.rabbiEvents.checked) {
        if (!r._marker._eventPopup) {
          r._marker._eventPopup = L.popup({
            autoClose: false,
            closeOnClick: false,
            autoPan: false,
            closeButton: false,
            className: "compact-popup auto-event-popup"
          });
        }

        r._marker._eventPopup
          .setLatLng(pos)
          .setContent(`<div class="auto-event-content">${moveEvent.event}</div>`);

        if (!map.hasLayer(r._marker._eventPopup)) {
          r._marker._eventPopup.addTo(map);
        }
      } else if (r._marker._eventPopup && map.hasLayer(r._marker._eventPopup)) {
        map.removeLayer(r._marker._eventPopup);
      }

      arrivals.push({ r, pos });
    } else if (r._marker) {
      r._marker.setOpacity(0);
      r._marker.closePopup?.();
      r._marker.unbindPopup();
      setLayerClickable(r._marker, false);

      if (r._marker._eventPopup && map.hasLayer(r._marker._eventPopup)) {
        map.removeLayer(r._marker._eventPopup);
      }
    }
  });

  groupVisibleRabbis(arrivals, y);
}

function groupVisibleRabbis(arrivals, y) {
  const groups = {};

  arrivals.forEach(entry => {
    const key = entry.pos.join(",");
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry.r);
  });

  RABBIS.concat(PERSONALITIES).forEach(r => {
    if (r._groupMarker) {
      r._groupMarker.off();
      r._groupMarker.closePopup?.();
      map.removeLayer(r._groupMarker);
      r._groupMarker = null;
    }
  });

  Object.entries(groups).forEach(([key, rs]) => {
    const pos = key.split(",").map(Number);

    if (rs.length > 1) {
      rs.forEach(r => {
        if (r._marker) {
          r._marker.setOpacity(0);
          r._marker.closePopup?.();
          r._marker.unbindPopup();
          setLayerClickable(r._marker, false);
        }
      });

      const marker = L.marker(pos, {
        pane: "rabbisPane",
        keyboard: false,
icon: L.divIcon({
  html: buildGroupHTML(rs, y),
  className: "rabbi-img-icon",
  iconSize: [220 * RABBI_SCALE, 120 * RABBI_SCALE],
  iconAnchor: [110 * RABBI_SCALE, 20 * RABBI_SCALE],
  popupAnchor: [0, -20 * RABBI_SCALE]
})
      }).addTo(map);

      marker._displayYear = y;
      rs.forEach(r => (r._groupMarker = marker));

      setTimeout(() => {
        const el = marker.getElement();
        if (!el) return;

        el.style.pointerEvents = "auto";

        const img = el.querySelector(".rabbi-group-img");

        if (img) {
          img.onclick = e => {
            e.stopPropagation();
            marker.bindPopup(() => buildEntityPopup(rs, marker._displayYear || currentYear), { autoPan: true }).openPopup();
          };
        }

        el.querySelectorAll(".rabbi-name").forEach((lbl, idx) => {
          lbl.onclick = e => {
            e.stopPropagation();
            const r = rs[idx];
            marker.bindPopup(() => buildEntityPopup([r], marker._displayYear || currentYear), { autoPan: true }).openPopup();
          };
        });
      }, 0);
    } else {
      const r = rs[0];

      if (r._marker) {
        r._marker.setLatLng(pos);
        r._marker.setOpacity(1);
        r._marker._displayYear = y;

r._marker.setIcon(L.divIcon({
  html: buildSingleHTML(r, y),
  className: "rabbi-img-icon",
  iconSize: [220 * RABBI_SCALE, 90 * RABBI_SCALE],
  iconAnchor: [110 * RABBI_SCALE, 20 * RABBI_SCALE],
  popupAnchor: [0, -20 * RABBI_SCALE]
}));

        r._marker.bindPopup(() => buildEntityPopup([r], r._marker?._displayYear || currentYear));
        setTimeout(() => setLayerClickable(r._marker, true), 0);
      }
    }
  });
}

function updateEventBox(events) {
  lastEventsList = events;
  if (document.body.classList.contains("story-active")) {
    eventToggle.style.display = "none";
    eventBox.style.display = "none";
    return;
  }

  lastEventsList = events;
  if (!events.length) {
    eventToggle.style.display = "none";
    eventBox.style.display = "none";
    eventPanelOpen = false;
    return;
  }

  eventToggle.style.display = "block";
  eventToggle.textContent = `Events (${events.length}) ${eventPanelOpen ? "▴" : "▾"}`;
  eventBox.innerHTML = "<ul>" + events.map(e => `<li>${e}</li>`).join("") + "</ul>";
  eventBox.style.display = eventPanelOpen ? "block" : "none";
}

eventToggle.onclick = () => {
  eventPanelOpen = !eventPanelOpen;
  updateEventBox(lastEventsList);
};

async function show(y, animate = false) {
  const token = ++showToken;
  const year = Number(y);
  currentYear = year;
  yearBox.textContent = year;

  const borderOk = await drawBorders(year, token);
  if (!borderOk || token !== showToken) return;

  const eventsList = [];

  drawCities(year);
  drawBattles(year, eventsList);
  drawEvents(year, eventsList);

  const shouldDrawPeople = !map._isDraggingSlider;

  if (shouldDrawPeople) {
    drawShuls(year, animate, eventsList);
    renderRabbis(year, animate);
  }

  updateEventBox(eventsList);
  preloadNearbyBorders(currentIndex);
  if (document.body.classList.contains("story-active")) {
  ["yearNav", "rangeBox", "filters", "rabbiSearchBox", "sizeControl", "eventPanel", "slider", "year"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
}
}

function refreshRabbiMarkerSizes() {
  if (currentYear === null) return;

  RABBIS.concat(PERSONALITIES).forEach(r => {
    if (r._groupMarker) {
      r._groupMarker.off();
      r._groupMarker.closePopup?.();
      map.removeLayer(r._groupMarker);
      r._groupMarker = null;
    }

    if (r._marker) {
      r._marker.setIcon(L.divIcon({
        html: buildSingleHTML(r, currentYear),
        className: "rabbi-img-icon",
        iconSize: [220 * RABBI_SCALE, 90 * RABBI_SCALE],
        iconAnchor: [110 * RABBI_SCALE, 20 * RABBI_SCALE],
        popupAnchor: [0, -20 * RABBI_SCALE]
      }));
    }
  });

  renderRabbis(currentYear, false);
}
async function setupControlsAndDraw() {
  YEARS = YEARS.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  ACTIVE_YEARS = [...YEARS];

  fromInput.value = Math.min(...YEARS);
  toInput.value = Math.max(...YEARS);

  slider.max = ACTIVE_YEARS.length - 1;
  currentIndex = Math.floor(ACTIVE_YEARS.length / 2);
  slider.value = currentIndex;

  if (rabbiSizeSlider) {
    rabbiSizeSlider.addEventListener("input", function () {
      RABBI_SCALE = parseFloat(this.value);
      refreshRabbiMarkerSizes();
    });
  }
if (toggleRabbiNames) {
  toggleRabbiNames.addEventListener("change", function () {
    SHOW_RABBI_NAMES = this.checked;
    refreshRabbiMarkerSizes();
  });
}
populateRabbiSearch();
populateStoryDropdown();
setupStoryControls();

if (rabbiSearchButton && rabbiSearchInput) {
  rabbiSearchButton.addEventListener("click", jumpToRabbi);

  rabbiSearchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") jumpToRabbi();
  });
}

  slider.oninput = function() {
    map._isDraggingSlider = true;

    currentIndex = parseInt(this.value, 10);
    const selectedYear = ACTIVE_YEARS[currentIndex];
    yearBox.textContent = selectedYear;

    clearTimeout(sliderTimer);

    sliderTimer = setTimeout(async () => {
      map._isDraggingSlider = false;
      showToken++;
      await show(selectedYear, false);
    }, 320);
  };

  applyBtn.onclick = async function() {
    const min = Number(fromInput.value);
    const max = Number(toInput.value);

    ACTIVE_YEARS = YEARS.filter(v => v >= min && v <= max);
    if (!ACTIVE_YEARS.length) return;
populateRabbiSearch();
    slider.max = ACTIVE_YEARS.length - 1;
    currentIndex = Math.floor(ACTIVE_YEARS.length / 2);
    slider.value = currentIndex;

    await show(ACTIVE_YEARS[currentIndex]);
  };

  document.getElementById("prevYear").onclick = async () => {
    if (currentIndex > 0) {
      currentIndex--;
      slider.value = currentIndex;
      await show(ACTIVE_YEARS[currentIndex], true);
    }
  };

  document.getElementById("nextYear").onclick = async () => {
    if (currentIndex < ACTIVE_YEARS.length - 1) {
      currentIndex++;
      slider.value = currentIndex;
      await show(ACTIVE_YEARS[currentIndex], true);
    }
  };

  map.on("zoomstart", () => {
    map._isZoomingNow = true;
  });

  map.on("zoomend", async () => {
    map._isZoomingNow = false;
    if (currentYear !== null) await show(currentYear, false);
  });

  Object.values(filters).forEach(cb => {
    cb.addEventListener("change", async () => {
      if (currentYear !== null) await show(currentYear, false);
    });
  });

  await show(ACTIVE_YEARS[currentIndex]);
}

async function main() {
  try {
    yearBox.textContent = "Loading data...";
    await loadInitialData();
    await setupControlsAndDraw();
  } catch (err) {
    console.error(err);
    yearBox.textContent = "Error loading map data";
    alert("Error loading map data. Check the browser console for details.");
  }
}
function rabbiAppearsInActiveRange(r) {
  const minYear = Math.min(...ACTIVE_YEARS);
  const maxYear = Math.max(...ACTIVE_YEARS);

  const birth = Number(r.birth_year);
  const death = r.death_year ? Number(r.death_year) : maxYear;

  if (!Number.isFinite(birth)) return false;

  return birth <= maxYear && death >= minYear;
}

function populateRabbiSearch() {
  if (!rabbiSearchList) return;

  rabbiSearchList.innerHTML = "";

  RABBIS.concat(PERSONALITIES)
    .filter(rabbiAppearsInActiveRange)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .forEach(r => {
      const option = document.createElement("option");
      option.value = r.name;
      rabbiSearchList.appendChild(option);
    });
}

async function jumpToRabbi() {
  const query = rabbiSearchInput.value.trim().toLowerCase();
  if (!query) return;

  const allPeople = RABBIS.concat(PERSONALITIES);

  const r = allPeople.find(person =>
    String(person.name || "").toLowerCase() === query ||
    String(person.base_name || "").toLowerCase() === query ||
    String(person.title || "").toLowerCase() === query
  ) || allPeople.find(person =>
    String(person.name || "").toLowerCase().includes(query) ||
    String(person.base_name || "").toLowerCase().includes(query) ||
    String(person.title || "").toLowerCase().includes(query)
  );

  if (!r) {
    alert("Rabbi not found");
    return;
  }

  const moves = (RABBIS_MOV[r.name] || []).concat(PERSONALITIES_MOV[r.name] || []);
  const firstMoveYear = moves.length ? Number(moves[0].year) : Number(r.birth_year);
  const targetYear = firstMoveYear || Number(r.birth_year);

  let nearestIndex = 0;
  let smallestDiff = Infinity;

  ACTIVE_YEARS.forEach((year, index) => {
    const diff = Math.abs(Number(year) - targetYear);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      nearestIndex = index;
    }
  });

  currentIndex = nearestIndex;
  slider.value = currentIndex;

  await show(ACTIVE_YEARS[currentIndex], false);

  const pos =
    getPosition(moves, ACTIVE_YEARS[currentIndex]) ||
    (r.lat && r.lng ? [r.lat, r.lng] : null);

  if (pos) {
    map.setView(pos, Math.max(map.getZoom(), 8));
  }
}
// ==========================
// RABBI STORY / VIDEO MODE
// ==========================

function populateStoryDropdown() {
  const storySelect = document.getElementById("storyRabbiSelect");
  if (!storySelect) return;

  storySelect.innerHTML = `<option value="">Select rabbi...</option>`;

  RABBIS.concat(PERSONALITIES)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.name;
      opt.textContent = r.name;
      storySelect.appendChild(opt);
    });
}

function setupStoryControls() {
  const storyControl = document.getElementById("storyControl");
  const storyHeader = document.getElementById("storyHeader");
  const storyArrow = document.getElementById("storyDropdownArrow");

  if (storyHeader && storyControl) {
    storyHeader.onclick = () => {
      storyControl.classList.toggle("open");

      if (storyArrow) {
        storyArrow.textContent = storyControl.classList.contains("open") ? "▴" : "▾";
      }
    };
  }

  const playBtn = document.getElementById("playStory");
  const pauseBtn = document.getElementById("pauseStory");
  const stopBtn = document.getElementById("stopStory");
  const closeBtn = document.getElementById("storyPanelClose");

  if (playBtn) playBtn.onclick = playRabbiStory;
  if (pauseBtn) pauseBtn.onclick = pauseRabbiStory;
  if (stopBtn) stopBtn.onclick = stopRabbiStory;

  if (closeBtn) {
    closeBtn.onclick = () => {
      const panel = document.getElementById("storyPanel");
      if (panel) panel.style.display = "none";
    };
  }
}

async function playRabbiStory() {
  const storySelect = document.getElementById("storyRabbiSelect");
  const storySpeed = document.getElementById("storySpeed");

  if (!storySelect || !storySelect.value) return;

  const rabbiName = storySelect.value;

  if (storyPaused && currentStoryEvents.length) {
    document.body.classList.add("story-active");
    storyPaused = false;
    storyTimer = setInterval(showNextStoryEvent, Number(storySpeed.value));
    return;
  }

clearStoryMapObjects();
document.body.classList.add("story-active");

  currentStoryEvents =
    RABBIS_MOV[rabbiName] ||
    PERSONALITIES_MOV[rabbiName] ||
    [];

  currentStoryEvents = currentStoryEvents
    .filter(ev => ev.lat && ev.lng)
    .sort((a, b) => Number(a.year) - Number(b.year));

  if (!currentStoryEvents.length) {
    document.body.classList.remove("story-active");
    alert("No movement data found for this rabbi.");
    return;
  }

  currentStoryIndex = 0;

  storyLine = L.polyline([], {
    color: "red",
    weight: 4
  }).addTo(map);

  const panel = document.getElementById("storyPanel");
  if (panel) panel.style.display = "block";

  showNextStoryEvent();

  storyTimer = setInterval(
    showNextStoryEvent,
    Number(storySpeed.value)
  );
}

async function showNextStoryEvent() {
  if (currentStoryIndex >= currentStoryEvents.length) {
    clearInterval(storyTimer);
    storyTimer = null;
    return;
  }

  const storySelect = document.getElementById("storyRabbiSelect");
  const ev = currentStoryEvents[currentStoryIndex];
  const latlng = [ev.lat, ev.lng];

  map.flyTo(latlng, 7, {
    duration: 2
  });

  if (!storyMarker) {
    storyMarker = L.marker(latlng, {
      zIndexOffset: 20000
    }).addTo(map);
  } else {
    storyMarker.setLatLng(latlng);
  }

  if (storyLine) {
    storyLine.addLatLng(latlng);
  }

  document.getElementById("storyTitle").innerHTML = storySelect.value;
  document.getElementById("storyYear").innerHTML = ev.year || "";
  document.getElementById("storyText").innerHTML = ev.event || "";
showStoryDetails(ev);
  const eventYear = Number(ev.year);

  if (Number.isFinite(eventYear)) {
    let nearestIndex = 0;
    let smallestDiff = Infinity;

    ACTIVE_YEARS.forEach((year, index) => {
      const diff = Math.abs(Number(year) - eventYear);
      if (diff < smallestDiff) {
        smallestDiff = diff;
        nearestIndex = index;
      }
    });

    currentIndex = nearestIndex;
    slider.value = currentIndex;
    await show(ACTIVE_YEARS[currentIndex], false);
  }

  currentStoryIndex++;
}

function pauseRabbiStory() {
  if (storyTimer) {
    clearInterval(storyTimer);
    storyTimer = null;
    storyPaused = true;
  }
}

function stopRabbiStory() {
  document.body.classList.remove("story-active");

  restoreUIAfterStory();

  clearStoryMapObjects();

  const panel = document.getElementById("storyPanel");
  if (panel) panel.style.display = "none";

  const detailBox = document.getElementById("storyDetailBox");
  if (detailBox) detailBox.style.display = "none";
}
function clearStoryMapObjects() {
  if (storyTimer) {
    clearInterval(storyTimer);
    storyTimer = null;
  }

  storyPaused = false;
  currentStoryIndex = 0;
  currentStoryEvents = [];

  if (storyMarker) {
    map.removeLayer(storyMarker);
    storyMarker = null;
  }

  if (storyLine) {
    map.removeLayer(storyLine);
    storyLine = null;
  }
}

function showStoryDetails(point) {
  const box = document.getElementById("storyDetailBox");
  const img = document.getElementById("storyDetailImage");
  const extract = document.getElementById("storyDetailExtract");
  const more = document.getElementById("storyMoreText");
  const readMore = document.getElementById("storyReadMore");

const imgSrc = point.image || point.img || point.photo || "";
img.src = imgSrc;
img.style.display = imgSrc ? "block" : "none";

  extract.innerHTML = point.extract || point.event || "";
  more.innerHTML = point.read_more || "";
  more.style.display = "none";

  readMore.style.display = point.read_more ? "inline-block" : "none";
  readMore.onclick = () => {
    more.style.display = more.style.display === "none" ? "block" : "none";
    readMore.textContent = more.style.display === "none" ? "Read more" : "Show less";
  };

  box.style.display = "block";
}
function restoreUIAfterStory() {
  [
    "yearNav",
    "rangeBox",
    "filters",
    "rabbiSearchBox",
    "sizeControl",
    "eventPanel",
    "slider",
    "year"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "";
  });
}
document.getElementById("storyDetailClose").onclick = () => {
  document.getElementById("storyDetailBox").style.display = "none";
};
main();