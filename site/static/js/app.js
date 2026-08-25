let RABBI_SCALE = 0.65;
let SHOW_RABBI_NAMES = true;
let SHOW_RABBI_PICTURES = true;
let MOVE_DURATION = 320;

const CITY_MIN_ZOOM = 4;
const SHUL_MIN_ZOOM = 7;
const RABBI_MIN_ZOOM = 5;

const bordersEuropeEnhanced = {};
const jsonRequestCache = new Map();
const rabbiSearchInput = document.getElementById("rabbiSearchInput");
const rabbiSearchButton = document.getElementById("rabbiSearchButton");
const rabbiSearchList = document.getElementById("rabbiSearchList");
const seferSearchInput = document.getElementById("seferSearchInput");
const seferSearchButton = document.getElementById("seferSearchButton");
const seferSearchList = document.getElementById("seferSearchList");
const toggleRabbiNames = document.getElementById("toggleRabbiNames");
const toggleRabbiPictures = document.getElementById("toggleRabbiPictures");
let colors = {};
let YEARS = [];
let BORDER_YEARS = [];
let INITIAL_BORDER = null;
let CITIES = [];
const cityBuckets = new Map();
let visibleCities = new Set();
let BATTLES = [];
let TEMPORARY_REGIONS = [];
let BIBLICAL_REGIONS = [];
let EVENTS = [];
let SEFARIM = [];
let RABBIS = [];
let RABBIS_MOV = {};
let PERSONALITIES = [];
let PERSONALITIES_MOV = {};
let SHULS = [];
let SHULS_MOV = {};
let BIBLE_PLACES = [];
let DEMOGRAPHICS = [];
let demographicMarkers = [];
const demographicsByYear = new Map();

let layer = null;
let currentBorderYear = null;
let currentYear = null;
let ACTIVE_YEARS = [];
let currentIndex = 0;
let showToken = 0;
let sliderTimer = null;
let eventPanelOpen = false;
let lastEventsList = [];
let lastEventPanelHTML = "";
let followActive = false;
let followPaused = false;
let followedRabbi = null;
let followRunToken = 0;
let followStepStartedAt = 0;
let followLastPosition = null;
const followTileCache = new Map();
const entityColors = {};
let PEOPLE = [];
const peopleByName = new Map();
const followMovementCache = new Map();
let visibleMapEvents = [];
let eventLayoutFrame = null;
const eventsByYear = new Map();
const sefarimByYear = new Map();
const activeGroupMarkers = new Set();
const groupMarkersByKey = new Map();
let demographicsLoadPromise = null;
let shulsLoadPromise = null;

const yearBox = document.getElementById("year");
const slider = document.getElementById("slider");
const fromInput = document.getElementById("fromYear");
const toInput = document.getElementById("toYear");
const applyBtn = document.getElementById("applyRange");
const eventToggle = document.getElementById("eventToggle");
const eventBox = document.getElementById("eventBox");
const rabbiSizeSlider = document.getElementById("rabbiSizeSlider");
const demographicEditor = document.getElementById("demographicEditor");
const demographicMessage = document.getElementById("demographicMessage");
const demographicEntries = document.getElementById("demographicEntries");
const seferDetailPanel = document.getElementById("seferDetailPanel");
const seferDetailTitle = document.getElementById("seferDetailTitle");
const seferDetailSections = document.getElementById("seferDetailSections");
const seferDetailClose = document.getElementById("seferDetailClose");
const jumpYearInput = document.getElementById("jumpYearInput");
const jumpYearButton = document.getElementById("jumpYearButton");

const filters = {
  rabbis: document.getElementById("toggleRabbis"),
  shuls: document.getElementById("toggleShuls"),
  personalities: document.getElementById("togglePersonalities"),
  battles: document.getElementById("toggleBattles"),
  temporaryRegions: document.getElementById("toggleTemporaryRegions"),
  events: document.getElementById("toggleEvents"),
  sefarim: document.getElementById("toggleSefarim"),
  rabbiEvents: document.getElementById("toggleRabbiEvents"),
  demographics: document.getElementById("toggleDemographics")
};

function setLayerClickable(marker, clickable) {
  if (!marker) return;
  const el = marker.getElement?.();
  if (el) el.style.pointerEvents = clickable ? "auto" : "none";
}

function updateEventLeaderLine(ev, visible = true) {
  const origin = ev._position || getRecordLatLng(ev);
  const labelPosition = ev._label?.getLatLng?.();
  if (!origin || !labelPosition) return;

  if (!ev._leaderLine) {
    ev._leaderLine = L.polyline([origin, labelPosition], {
      pane: "eventLinesPane",
      color: "#202020",
      weight: 1,
      opacity: visible ? 0.62 : 0,
      interactive: false,
      lineCap: "round"
    }).addTo(map);
  } else {
    if (!map.hasLayer(ev._leaderLine)) ev._leaderLine.addTo(map);
    ev._leaderLine.setLatLngs([origin, labelPosition]);
    ev._leaderLine.setStyle({ opacity: visible ? 0.62 : 0 });
  }
}

function connectorSegmentsCross(a, b, c, d) {
  const orient = (p, q, r) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function layoutCoLocatedEventLabels() {
  const occupied = [];
  const gap = 3;

  const overlaps = (a, b) => !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );

  const pending = [];

  visibleMapEvents.forEach(ev => {
    const position = ev._position || getRecordLatLng(ev);
    const root = ev._label?.getElement?.();
    const element = root?.querySelector?.(".event-label-drag-area") || root;
    if (!position || !element) return;

    if (ev._labelPlaced) {
      occupied.push(element.getBoundingClientRect());
      updateEventLeaderLine(ev, true);
    } else {
      ev._label.setLatLng(position);
      pending.push({ ev, position, element, anchor: map.latLngToContainerPoint(position) });
    }
  });

  const clusters = [];
  pending.forEach(item => {
    const cluster = clusters.find(group => group.some(other => item.anchor.distanceTo(other.anchor) <= 58));
    if (cluster) cluster.push(item);
    else clusters.push([item]);
  });

  clusters.forEach(cluster => {
    const count = cluster.length;
    const centre = cluster.reduce(
      (sum, item) => ({ x: sum.x + item.anchor.x / count, y: sum.y + item.anchor.y / count }),
      { x: 0, y: 0 }
    );
    cluster.forEach(item => {
      item.sourceAngle = Math.atan2(item.anchor.y - centre.y, item.anchor.x - centre.x);
    });
    cluster.sort((a, b) =>
      a.sourceAngle - b.sourceAngle ||
      Number(b.ev.importance || 0) - Number(a.ev.importance || 0) ||
      String(a.ev.name).localeCompare(String(b.ev.name))
    );

    const initialDistance = count === 1 ? 20 : count <= 4 ? 32 : count <= 8 ? 46 : 58;
    let bestRotation = 0;
    let bestScore = Infinity;

    if (count > 1) {
      for (let rotation = 0; rotation < count; rotation++) {
        const segments = cluster.map((item, index) => {
          const angle = -Math.PI / 2 + Math.PI * 2 * ((index + rotation) % count) / count;
          return {
            start: item.anchor,
            end: L.point(
              item.anchor.x + Math.cos(angle) * initialDistance,
              item.anchor.y + Math.sin(angle) * initialDistance
            ),
            angle,
            sourceAngle: item.sourceAngle
          };
        });
        let crossings = 0;
        for (let i = 0; i < segments.length; i++) {
          for (let j = i + 1; j < segments.length; j++) {
            if (connectorSegmentsCross(segments[i].start, segments[i].end, segments[j].start, segments[j].end)) crossings++;
          }
        }
        const directionPenalty = segments.reduce((sum, segment) => {
          const difference = Math.atan2(
            Math.sin(segment.angle - segment.sourceAngle),
            Math.cos(segment.angle - segment.sourceAngle)
          );
          return sum + Math.abs(difference);
        }, 0);
        const score = crossings * 10000 + directionPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestRotation = rotation;
        }
      }
    }

    cluster.forEach((item, index) => {
      const base = item.element.getBoundingClientRect();
      const angle = count === 1
        ? -Math.PI / 2
        : -Math.PI / 2 + Math.PI * 2 * ((index + bestRotation) % count) / count;
      let distance = initialDistance;
      let x = Math.round(Math.cos(angle) * distance);
      let y = Math.round(Math.sin(angle) * distance);
      let box = null;

      while (distance <= 114) {
        box = {
          left: base.left + x,
          right: base.right + x,
          top: base.top + y,
          bottom: base.bottom + y
        };
        if (!occupied.some(other => overlaps(box, other))) break;
        distance += 14;
        x = Math.round(Math.cos(angle) * distance);
        y = Math.round(Math.sin(angle) * distance);
      }

      const labelPosition = map.containerPointToLatLng([
        item.anchor.x + x,
        item.anchor.y + y
      ]);
      item.ev._label.setLatLng(labelPosition);
      item.ev._labelPlaced = true;
      updateEventLeaderLine(item.ev, true);
      if (box) occupied.push(box);
    });
  });
}

function scheduleEventLabelLayout() {
  if (eventLayoutFrame !== null) cancelAnimationFrame(eventLayoutFrame);
  eventLayoutFrame = requestAnimationFrame(() => {
    eventLayoutFrame = null;
    layoutCoLocatedEventLabels();
  });
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadSavedDemographics(baseRecords = []) {
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem("mapDemographics") || "[]");
  } catch (error) {
    console.warn("Could not read saved demographic data:", error);
  }

  const records = new Map();
  [...baseRecords, ...(Array.isArray(saved) ? saved : [])].forEach(record => {
    if (!record || !Array.isArray(record.latlng)) return;
    const id = record.id || `${record.place}-${record.label}-${record.start_year}`;
    records.set(id, { ...record, id });
  });
  return Array.from(records.values());
}

function buildPeopleIndexes() {
  PEOPLE = RABBIS.concat(PERSONALITIES).sort(
    (a, b) => String(a.name).localeCompare(String(b.name))
  );
  peopleByName.clear();
  followMovementCache.clear();
  const rabbiSet = new Set(RABBIS);
  PEOPLE.forEach(person => {
    person._entityKind = rabbiSet.has(person) ? "rabbi" : "personality";
    person._movements = [
      ...(RABBIS_MOV[person.name] || []),
      ...(PERSONALITIES_MOV[person.name] || [])
    ].filter(move => Number.isFinite(Number(move.year)))
      .sort((a, b) => Number(a.year) - Number(b.year));
    person._movementEventsByYear = new Map(
      person._movements
        .filter(move => move.event)
        .map(move => [Number(move.year), move])
    );
    peopleByName.set(person.name, person);
  });
}

function cleanRecordName(value) {
  const element = document.createElement("div");
  element.innerHTML = String(value || "");
  return element.textContent.replace(/^\s*ðŸ“–\s*/, "").trim();
}

function searchValues(record) {
  const fields = [
    record?.name, record?.base_name, record?.title, record?.titles,
    record?.hebrew_name, record?.name_he, record?.hebrew,
    record?.english_name, record?.aliases, record?.alternative_names,
    record?.transliterations
  ];
  return [...new Set(fields.flatMap(value =>
    Array.isArray(value) ? value : String(value || "").split(/[|;]/)
  ).map(value => cleanRecordName(value)).filter(Boolean))];
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u0591-\u05c7]/g, "")
    .toLowerCase()
    .replace(/\b(?:rabbi|rabbenu|rabbeinu|rav|rebbe|reb|gaon|hakohen)\b/g, " ")
    .replace(/(?:^|\s)r[â€™'`.]?\s*/g, " ")
    .replace(/ph/g, "f").replace(/ck/g, "k").replace(/kh|ch/g, "h")
    .replace(/tz|ts/g, "z").replace(/w/g, "v")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = old;
    }
  }
  return previous[b.length];
}

function matchScore(record, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return Infinity;
  const compactQuery = normalizedQuery.replace(/\s/g, "");
  let best = Infinity;
  searchValues(record).forEach(value => {
    const term = normalizeSearchText(value);
    if (!term) return;
    if (term === normalizedQuery) best = Math.min(best, 0);
    else if (term.startsWith(normalizedQuery)) best = Math.min(best, 5 + term.length - normalizedQuery.length);
    else if (term.includes(normalizedQuery)) best = Math.min(best, 20 + term.length - normalizedQuery.length);
    const compactTerm = term.replace(/\s/g, "");
    const distance = searchDistance(compactTerm, compactQuery);
    const allowance = Math.max(2, Math.floor(Math.max(compactTerm.length, compactQuery.length) * 0.3));
    if (distance <= allowance) best = Math.min(best, 40 + distance);
  });
  return best;
}

function findApproximateRecord(records, query) {
  return records
    .map(record => ({ record, score: matchScore(record, query) }))
    .filter(result => Number.isFinite(result.score))
    .sort((a, b) => a.score - b.score || String(a.record.name).localeCompare(String(b.record.name)))[0]?.record || null;
}

function isSeferEvent(event) {
  const tags = Array.isArray(event.tags)
    ? event.tags.map(tag => String(tag).toLowerCase())
    : String(event.tags || "").toLowerCase().split(/[,\s]+/);
  return event.category === "texts_publications" ||
    tags.includes("sefer") ||
    tags.includes("sefarim") ||
    String(event.id || "").toLowerCase().startsWith("sefarim_") ||
    event.emoji === "ðŸ“–";
}

function openSeferDetails(sefer) {
  if (!seferDetailPanel || !seferDetailSections) return;
  const sections = Array.isArray(sefer.book_sections) ? sefer.book_sections : [];
  seferDetailTitle.textContent = `ðŸ“– ${cleanRecordName(sefer.name)}`;

  if (!sections.length) {
    seferDetailSections.innerHTML =
      '<div class="sefer-section-card sefer-section-empty">No additional sections have been added to this book yet.</div>';
  } else {
    seferDetailSections.innerHTML = sections.map(section => {
      const content = escapeHTML(section.content || "").replace(/\r?\n/g, "<br>");
      return `<section class="sefer-section-card">
        <h3>${escapeHTML(section.title || "Book section")}</h3>
        ${section.subtitle ? `<div class="sefer-section-subtitle">${escapeHTML(section.subtitle)}</div>` : ""}
        <div class="sefer-section-content">${content}</div>
      </section>`;
    }).join("");
  }

  if (sefer.source_url && /^https?:\/\//i.test(sefer.source_url)) {
    seferDetailSections.insertAdjacentHTML(
      "beforeend",
      `<a class="sefer-source-link" href="${escapeHTML(sefer.source_url)}" target="_blank" rel="noopener noreferrer">Open source text â†—</a>`
    );
  }
  seferDetailPanel.classList.add("open");
  seferDetailPanel.setAttribute("aria-hidden", "false");
}

function closeSeferDetails() {
  seferDetailPanel?.classList.remove("open");
  seferDetailPanel?.setAttribute("aria-hidden", "true");
}

function setupSeferDetails() {
  seferDetailClose?.addEventListener("click", closeSeferDetails);
  document.addEventListener("click", event => {
    const button = event.target.closest?.(".sefer-sections-button");
    if (!button) return;
    const sefer = SEFARIM.find(item => String(item.id) === button.dataset.seferId);
    if (sefer) openSeferDetails(sefer);
  });
}

function buildEventIndex() {
  eventsByYear.clear();
  sefarimByYear.clear();
  SEFARIM = [];

  EVENTS.forEach(event => {
    event._position = getRecordLatLng(event);
    event._isSefer = isSeferEvent(event);
    event._symbol = event._isSefer
      ? { text: "ðŸ“–", className: "default-event-symbol sefer-symbol" }
      : getEventSymbol(event);
    if (event._isSefer) SEFARIM.push(event);

    const singleYear = Number(event.year);
    const start = Number(event.start_year ?? event.year);
    const end = Number(event.end_year ?? event.year);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;

    const first = Number.isFinite(singleYear) ? singleYear : Math.ceil(Math.min(start, end));
    const last = Number.isFinite(singleYear) ? singleYear : Math.floor(Math.max(start, end));
    const targetIndex = event._isSefer ? sefarimByYear : eventsByYear;
    for (let year = first; year <= last; year++) {
      if (!targetIndex.has(year)) targetIndex.set(year, []);
      targetIndex.get(year).push(event);
    }
  });

  SEFARIM.sort((a, b) => cleanRecordName(a.name).localeCompare(cleanRecordName(b.name)));
}

function buildCityIndex() {
  cityBuckets.clear();
  CITIES.forEach((city, index) => {
    city._position = getRecordLatLng(city);
    city._labelZoom = Number(city.label_zoom) || (index < 100 ? 4 : index < 1000 ? 7 : 9);
    if (!cityBuckets.has(city._labelZoom)) cityBuckets.set(city._labelZoom, []);
    cityBuckets.get(city._labelZoom).push(city);
  });
}

function persistDemographics() {
  localStorage.setItem("mapDemographics", JSON.stringify(DEMOGRAPHICS));
}

function buildDemographicIndex() {
  demographicsByYear.clear();
  DEMOGRAPHICS.forEach(record => {
    const start = Number(record.start_year ?? record.year);
    const end = Number(record.end_year ?? record.year ?? record.start_year);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    for (let year = Math.ceil(Math.min(start, end)); year <= Math.floor(Math.max(start, end)); year++) {
      if (!demographicsByYear.has(year)) demographicsByYear.set(year, []);
      demographicsByYear.get(year).push(record);
    }
  });
}

function demographicInYear(record, year) {
  const start = Number(record.start_year ?? record.year);
  const end = Number(record.end_year ?? record.year ?? record.start_year);
  return Number.isFinite(start) && Number(year) >= start && Number(year) <= end;
}

function formatDemographicValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : escapeHTML(value);
}

function drawDemographics(year) {
  demographicMarkers.forEach(marker => map.removeLayer(marker));
  demographicMarkers = [];

  if (!filters.demographics?.checked) return;

  const groups = new Map();
  (demographicsByYear.get(Number(year)) || []).forEach(record => {
    const lat = Number(record.latlng?.[0]);
    const lng = Number(record.latlng?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, { latlng: [lat, lng], records: [] });
    groups.get(key).records.push(record);
  });

  const detailed = map.getZoom() >= 6;
  const visibleBounds = map.getBounds().pad(0.15);

  groups.forEach(group => {
    if (detailed && !visibleBounds.contains(group.latlng)) return;

    if (!detailed) {
      const largest = Math.max(...group.records.map(record => Number(record.value) || 0));
      const radius = Math.max(3, Math.min(14, 2 + Math.log10(Math.max(1, largest)) * 2));
      const colour = group.records[0].color || "#3568a8";
      const summary = group.records.map(record =>
        `${escapeHTML(record.label)}: ${formatDemographicValue(record.value)}`
      ).join("<br>");
      const circle = L.circleMarker(group.latlng, {
        pane: "demographicsPane",
        radius,
        color: "#fff",
        weight: 1,
        fillColor: colour,
        fillOpacity: 0.78
      }).bindTooltip(
        `<strong>${escapeHTML(group.records[0].place)}</strong><br>${summary}`,
        { direction: "top", className: "demographic-tooltip" }
      ).addTo(map);
      demographicMarkers.push(circle);
      return;
    }

    const rows = group.records.map(record => {
      const value = Number(record.value);
      const total = Number(record.total);
      const suppliedPercent = record.percent === undefined ? NaN : Number(record.percent);
      const percent = Number.isFinite(suppliedPercent)
        ? Math.max(0, Math.min(100, suppliedPercent))
        : Number.isFinite(value) && Number.isFinite(total) && total > 0
          ? Math.max(0, Math.min(100, value / total * 100))
          : null;
      const colour = /^#[0-9a-f]{6}$/i.test(record.color || "")
        ? record.color
        : "#3568a8";
      const low = record.low === undefined ? NaN : Number(record.low);
      const high = record.high === undefined ? NaN : Number(record.high);
      const range = Number.isFinite(low) || Number.isFinite(high)
        ? ` <small>(${Number.isFinite(low) ? formatDemographicValue(low) : "?"}â€“${Number.isFinite(high) ? formatDemographicValue(high) : "?"})</small>`
        : "";
      return `<div class="demographic-stat">
        <div class="demographic-stat-line">
          <span>${escapeHTML(record.label)}</span>
          <strong>${formatDemographicValue(record.value)}${range}${percent === null ? "" : ` (${percent.toFixed(1)}%)`}</strong>
        </div>
        ${percent === null ? "" : `<div class="demographic-bar"><span style="width:${percent}%;background:${colour}"></span></div>`}
        <div class="demographic-meta">${escapeHTML(record.date_label || record.start_year)}${record.confidence ? ` Â· ${escapeHTML(record.confidence)} confidence` : ""}</div>
      </div>`;
    }).join("");

    const html = `<div class="demographic-card">
      <div class="demographic-card-title">${escapeHTML(group.records[0].place)}${group.records[0].country ? `, ${escapeHTML(group.records[0].country)}` : ""}</div>
      ${rows}
    </div>`;
    const marker = L.marker(group.latlng, {
      pane: "demographicsPane",
      interactive: true,
      keyboard: false,
      icon: L.divIcon({
        className: "",
        html,
        iconSize: [190, null],
        iconAnchor: [95, 0]
      })
    }).addTo(map);
    const sourceRows = group.records.map(record => {
      const source = record.source_url
        ? `<a href="${escapeHTML(record.source_url)}" target="_blank" rel="noopener">${escapeHTML(record.source || "Source")}</a>`
        : escapeHTML(record.source || "Source not specified");
      return `<div><strong>${escapeHTML(record.label)}</strong>: ${source}<br><small>${escapeHTML(record.source_detail || record.notes || "")}</small></div>`;
    }).join("<hr>");
    marker.bindPopup(sourceRows, { maxWidth: 360 });
    demographicMarkers.push(marker);
  });
}

function renderDemographicEntries() {
  if (!demographicEntries) return;
  demographicEntries.innerHTML = DEMOGRAPHICS.length
    ? DEMOGRAPHICS.map(record => `<div class="demographic-entry">
        <span>${escapeHTML(record.place)}: ${escapeHTML(record.label)} (${escapeHTML(record.start_year)}${record.end_year && record.end_year !== record.start_year ? `â€“${escapeHTML(record.end_year)}` : ""})</span>
        <button data-demographic-delete="${escapeHTML(record.id)}" title="Delete">Delete</button>
      </div>`).join("")
    : "<small>No demographic records yet.</small>";
}

function setupDemographicEditor() {
  const byId = id => document.getElementById(id);
  byId("demographicEditorToggle")?.addEventListener("click", () => {
    demographicEditor?.classList.toggle("open");
  });
  byId("demographicUseCenter")?.addEventListener("click", () => {
    const centre = map.getCenter();
    byId("demographicLat").value = centre.lat.toFixed(6);
    byId("demographicLng").value = centre.lng.toFixed(6);
  });
  map.on("click", event => {
    if (!demographicEditor?.classList.contains("open")) return;
    byId("demographicLat").value = event.latlng.lat.toFixed(6);
    byId("demographicLng").value = event.latlng.lng.toFixed(6);
  });
  byId("demographicSave")?.addEventListener("click", async () => {
    const place = byId("demographicPlace").value.trim();
    const label = byId("demographicLabel").value.trim();
    const value = Number(byId("demographicValue").value);
    const totalText = byId("demographicTotal").value;
    const start = Number(byId("demographicStart").value);
    const endText = byId("demographicEnd").value;
    const end = endText === "" ? start : Number(endText);
    const lat = Number(byId("demographicLat").value);
    const lng = Number(byId("demographicLng").value);
    if (!place || !label || !Number.isFinite(value) || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      demographicMessage.textContent = "Enter a place, statistic, value, start year, latitude and longitude.";
      return;
    }
    const record = {
      id: `demographic-${Date.now()}`,
      place,
      label,
      value,
      start_year: start,
      end_year: end,
      latlng: [lat, lng],
      color: byId("demographicColor").value
    };
    if (totalText !== "") record.total = Number(totalText);
    DEMOGRAPHICS.push(record);
    buildDemographicIndex();
    persistDemographics();
    renderDemographicEntries();
    demographicMessage.textContent = "Statistic added.";
    if (currentYear !== null) await show(currentYear, false);
  });
  byId("demographicExport")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(DEMOGRAPHICS, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "demographics.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });
  demographicEntries?.addEventListener("click", async event => {
    const id = event.target?.dataset?.demographicDelete;
    if (!id) return;
    DEMOGRAPHICS = DEMOGRAPHICS.filter(record => record.id !== id);
    buildDemographicIndex();
    persistDemographics();
    renderDemographicEntries();
    if (currentYear !== null) await show(currentYear, false);
  });
}

async function loadJSON(path) {
  if (jsonRequestCache.has(path)) {
    return jsonRequestCache.get(path);
  }

  if (window.__EMBEDDED_DATA__ && path in window.__EMBEDDED_DATA__) {
    const embedded = Promise.resolve(window.__EMBEDDED_DATA__[path]);
    jsonRequestCache.set(path, embedded);
    return embedded;
  }

  const request = fetch(path, { cache: "default" })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status}`);
      }

      return response.json();
    })
    .catch(error => {
      jsonRequestCache.delete(path);
      throw error;
    });

  jsonRequestCache.set(path, request);

  return request;
}

const EVENT_FILES = [
  "data/events.json",
  "data/sefarim.json",
  "eventsgrouped/printing_presses.json"
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

function buildContinuousYears(sourceYears) {
  const numeric = sourceYears
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!numeric.length) return [];

  const minYear = numeric[0];
  const maxYear = numeric[numeric.length - 1];

  return Array.from(
    { length: maxYear - minYear + 1 },
    (_, i) => minYear + i
  );
}

async function loadInitialData() {
  [
    colors,
    YEARS,
    BORDER_YEARS,
    INITIAL_BORDER,
    CITIES,
    BATTLES,
    TEMPORARY_REGIONS,
    BIBLICAL_REGIONS,
    EVENTS,
    RABBIS,
    RABBIS_MOV,
    PERSONALITIES,
    PERSONALITIES_MOV,
    BIBLE_PLACES
  ] = await Promise.all([
    loadJSON("data/colors.json"),
    loadJSON("data/years.json"),
    loadJSON("data/border_years.json"),
    loadJSON("data/initial_border.json"),
    loadJSON("data/cities.json"),
    loadJSON("data/battles.json"),
    loadJSON("data/temporary_regions.json"),
    loadJSON("data/biblical_regions.json"),

    loadAllEvents(),

    loadJSON("data/rabbis.json"),
    loadJSON("data/rabbis_movement.json"),
    loadJSON("data/personalities.json"),
    loadJSON("data/personalities_movement.json"),
    loadJSON("data/bible_places.json")
  ]);

  const biblicalReplacementNames = new Set(
    BIBLICAL_REGIONS.map(region => region.replaces || region.name)
  );
  TEMPORARY_REGIONS = TEMPORARY_REGIONS
    .filter(region => !biblicalReplacementNames.has(region.name))
    .concat(BIBLICAL_REGIONS.filter(region => !region.remove));

  buildCityIndex();
  buildEventIndex();
  buildPeopleIndexes();

  BORDER_YEARS = BORDER_YEARS
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (INITIAL_BORDER?.data && Number.isFinite(Number(INITIAL_BORDER.year))) {
    bordersEuropeEnhanced[Number(INITIAL_BORDER.year)] = INITIAL_BORDER.data;
  }

  YEARS = buildContinuousYears(BORDER_YEARS);

  console.log("Loaded events:", EVENTS.length);
  console.log(
    "Timeline years:",
    YEARS.length,
    "Border snapshots:",
    BORDER_YEARS.length
  );
}

async function loadDeferredShuls() {
  if (shulsLoadPromise) return shulsLoadPromise;
  shulsLoadPromise = Promise.all([
    loadJSON("data/shuls.json"),
    loadJSON("data/shuls_movement.json")
  ]).then(([shuls, movements]) => {
    SHULS = shuls;
    SHULS_MOV = movements;
    if (currentYear !== null && filters.shuls.checked) drawShuls(currentYear, false, []);
  }).catch(error => {
    shulsLoadPromise = null;
    console.warn("Could not load synagogue data:", error);
  });
  return shulsLoadPromise;
}

async function loadDeferredDemographics() {
  if (demographicsLoadPromise) return demographicsLoadPromise;
  demographicsLoadPromise = loadJSON("data/demographics.json")
    .then(baseDemographics => {
      DEMOGRAPHICS = loadSavedDemographics(
        Array.isArray(baseDemographics) ? baseDemographics : []
      );
      buildDemographicIndex();
      renderDemographicEntries();
      if (currentYear !== null && filters.demographics?.checked) drawDemographics(currentYear);
    })
    .catch(error => {
      demographicsLoadPromise = null;
      console.warn("Could not load demographic data:", error);
    });
  return demographicsLoadPromise;
}

async function tryLoadBordersForYear(year) {
  if (bordersEuropeEnhanced[year]) {
    return bordersEuropeEnhanced[year];
  }

  try {
    const borderData = await loadJSON(
      `data/borders/${year}.geojson`
    );

    bordersEuropeEnhanced[year] = borderData;

    return borderData;
  } catch {
    return null;
  }
}

async function findAvailableBorderYear(year) {
  const requested = Number(year);

  const candidates = BORDER_YEARS
    .map(Number)
    .filter(y => Number.isFinite(y) && y <= requested)
    .sort((a, b) => b - a);

  for (const candidate of candidates) {
    const border = await tryLoadBordersForYear(candidate);

    if (border) {
      return candidate;
    }
  }

  const earliestCandidates = BORDER_YEARS
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  for (const candidate of earliestCandidates) {
    const border = await tryLoadBordersForYear(candidate);

    if (border) {
      return candidate;
    }
  }

  return null;
}

function preloadNearbyBorders(index) {
  [index - 1, index + 1].forEach(i => {
    if (
      i >= 0 &&
      i < ACTIVE_YEARS.length
    ) {
      findAvailableBorderYear(
        ACTIVE_YEARS[i]
      ).catch(() => {});
    }
  });
}

const map = L.map("map", {
  center: [52, 10],
  zoom: 4,
  zoomAnimation: true,
  markerZoomAnimation: true,
  fadeAnimation: true,
  preferCanvas: true
});

const borderRenderer = L.canvas({ padding: 0.45 });

map.createPane("bordersPane").style.zIndex = 200;
map.createPane("shulsPane").style.zIndex = 600;

map.createPane("eventLinesPane");
map.getPane("eventLinesPane").style.zIndex = 575;
map.getPane("eventLinesPane").style.pointerEvents = "none";

map.createPane("eventLabelsPane");
map.getPane("eventLabelsPane").style.zIndex = 675;
map.getPane("eventLabelsPane").style.pointerEvents = "none";

map.createPane("rabbisPane");
map.getPane("rabbisPane").style.zIndex = 680;
map.getPane("rabbisPane").style.pointerEvents = "auto";

map.createPane("sefarimPane");
map.getPane("sefarimPane").style.zIndex = 690;
map.getPane("sefarimPane").style.pointerEvents = "auto";

map.createPane("demographicsPane");
map.getPane("demographicsPane").style.zIndex = 650;
map.getPane("demographicsPane").style.pointerEvents = "auto";

map.getPane("popupPane").style.zIndex = 1000;
map.getPane("tooltipPane").style.zIndex = 995;

if (!window.__EMBEDDED_DATA__) {
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      updateWhenIdle: false,
      updateWhenZooming: false,
      updateInterval: 120,
      keepBuffer: 3
    }
  ).addTo(map);
}

function animateMarker(
  marker,
  from,
  to,
  duration = MOVE_DURATION
) {
  if (!from || !to) return;

  if (marker._moveAnimationFrame) {
    cancelAnimationFrame(marker._moveAnimationFrame);
  }

  const start = performance.now();

  function step(timestamp) {
    const t = Math.min(
      1,
      (timestamp - start) / duration
    );

    const eased =
      t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

    marker.setLatLng([
      from[0] + (to[0] - from[0]) * eased,
      from[1] + (to[1] - from[1]) * eased
    ]);

    if (
      marker._eventPopup &&
      map.hasLayer(marker._eventPopup)
    ) {
      marker._eventPopup.setLatLng(marker.getLatLng());
    }

    if (t < 1) {
      marker._moveAnimationFrame = requestAnimationFrame(step);
    } else {
      marker._moveAnimationFrame = null;
    }
  }

  marker._moveAnimationFrame = requestAnimationFrame(step);
}


// ===== Country colour controls =====

const COUNTRY_COLOUR_SETTINGS = {
  whitenAmount: 0.15,
  fillOpacity: 0.22,
  borderWeight: 0.6,
  borderColour: "rgba(0,0,0,0.5)",
  fallbackColour: "rgba(180,180,180,0.25)"
};

function softCountryColor(name) {
  const base = colors[name];

  if (!base) {
    return COUNTRY_COLOUR_SETTINGS.fallbackColour;
  }

  const match = String(base).match(/\d+/g);

  if (
    !match ||
    match.length < 3
  ) {
    return base;
  }

  const [r, g, b] = match.map(Number);
  const mix = COUNTRY_COLOUR_SETTINGS.whitenAmount;

  const sr = Math.round(
    r + (255 - r) * mix
  );

  const sg = Math.round(
    g + (255 - g) * mix
  );

  const sb = Math.round(
    b + (255 - b) * mix
  );

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

function getPosition(
  movement,
  year
) {
  const moves = movement || [];
  const y = Number(year);
  let low = 0;
  let high = moves.length - 1;
  let match = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    if (Number(moves[middle].year) <= y) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return match >= 0 ? moves[match].latlng : null;
}

function getRecordLatLng(record) {
  if (
    Array.isArray(record?.latlng) &&
    record.latlng.length === 2
  ) {
    return [
      Number(record.latlng[0]),
      Number(record.latlng[1])
    ];
  }

  if (
    Number.isFinite(Number(record?.lat)) &&
    Number.isFinite(Number(record?.lng))
  ) {
    return [
      Number(record.lat),
      Number(record.lng)
    ];
  }

  return null;
}

function getAgeText(
  entity,
  year
) {
  const birth = Number(
    entity.birth_year
  );

  const death =
    entity.death_year === undefined ||
    entity.death_year === null ||
    entity.death_year === ""
      ? null
      : Number(entity.death_year);

  const y = Number(year);

  if (
    !Number.isFinite(birth) ||
    !Number.isFinite(y) ||
    y < birth
  ) {
    return "";
  }

  if (
    death &&
    Number.isFinite(death) &&
    y >= death
  ) {
    return `died aged ${death - birth}`;
  }

  return `age ${y - birth}`;
}

function getYearsText(entity) {
  if (!entity.birth_year) {
    return "";
  }

  return `${entity.birth_year}${
    entity.death_year
      ? "â€“" + entity.death_year
      : ""
  }`;
}

function buildPopup(content) {
  return `<div style="background:#eee;padding:6px 10px;border-radius:6px;font-style:italic;max-width:250px;">${content}</div>`;
}

function getEntityColor(name) {
  if (!entityColors[name]) {
    const h =
      Math.abs(
        String(name)
          .split("")
          .reduce(
            (a, c) =>
              a + c.charCodeAt(0),
            0
          )
      ) % 360;

    entityColors[name] =
      `hsl(${h},70%,45%)`;
  }

  return entityColors[name];
}

function getDisplayName(
  r,
  y
) {
  return String(
    r.base_name ||
    r.name ||
    "Unknown person"
  ).trim();
}

function getEntityTitle(
  r,
  y
) {
  const parts = [];

  if (
    Array.isArray(r.titles)
  ) {
    const match =
      r.titles.find(
        t =>
          Number(y) >= Number(t.start) &&
          Number(y) <= Number(t.end)
      );

    if (
      match &&
      match.title
    ) {
      parts.push(match.title);
    }
  }

  if (r.title) {
    parts.push(r.title);
  }

  const displayName = normalizeSearchText(getDisplayName(r, y));
  return [...new Set(parts.map(value => String(value || "").trim()))]
    .filter(value => value && normalizeSearchText(value) !== displayName)
    .join(" Â· ");
}

function getEntityMapEndYear(entity) {
  const death = Number(entity?.death_year);
  if (
    entity?.death_year !== undefined &&
    entity?.death_year !== null &&
    entity?.death_year !== "" &&
    Number.isFinite(death)
  ) {
    return death;
  }

  const mapEnd = Number(entity?.map_end_year);
  return Number.isFinite(mapEnd) ? mapEnd : Infinity;
}

const HEBREW_NAME_WORDS = {
  aaron: "××”×¨×Ÿ", aharon: "××”×¨×Ÿ", abraham: "××‘×¨×”×", avraham: "××‘×¨×”×",
  akiva: "×¢×§×™×‘×", aryeh: "××¨×™×”", baruch: "×‘×¨×•×š", ben: "×‘×Ÿ", chaim: "×—×™×™×",
  dov: "×“×‘", elazar: "××œ×¢×–×¨", eliezer: "××œ×™×¢×–×¨", eliyahu: "××œ×™×”×•",
  ephraim: "××¤×¨×™×", ezra: "×¢×–×¨×", gershon: "×’×¨×©×•×Ÿ", hillel: "×”×œ×œ",
  isaac: "×™×¦×—×§", yitzchak: "×™×¦×—×§", israel: "×™×©×¨××œ", yisrael: "×™×©×¨××œ",
  jacob: "×™×¢×§×‘", yaakov: "×™×¢×§×‘", joseph: "×™×•×¡×£", yosef: "×™×•×¡×£",
  judah: "×™×”×•×“×”", yehuda: "×™×”×•×“×”", levi: "×œ×•×™", meir: "×ž××™×¨",
  menachem: "×ž× ×—×", moses: "×ž×©×”", moshe: "×ž×©×”", mordechai: "×ž×¨×“×›×™",
  nachman: "× ×—×ž×Ÿ", naftali: "× ×¤×ª×œ×™", ovadia: "×¢×•×‘×“×™×”", pinchas: "×¤× ×—×¡",
  samuel: "×©×ž×•××œ", shmuel: "×©×ž×•××œ", shimon: "×©×ž×¢×•×Ÿ", shlomo: "×©×œ×ž×”",
  solomon: "×©×œ×ž×”", tzvi: "×¦×‘×™", zevi: "×¦×‘×™", zalman: "×–×œ×ž×Ÿ"
};

function transliterateNameWord(word) {
  const clean = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return "";
  if (HEBREW_NAME_WORDS[clean]) return HEBREW_NAME_WORDS[clean];

  const clusters = [
    ["sch", "×©"], ["tch", "×˜×©"], ["sh", "×©"], ["ch", "×—"],
    ["tz", "×¦"], ["ts", "×¦"], ["ph", "×¤"], ["th", "×ª"],
    ["ck", "×§"], ["oo", "×•"], ["ee", "×™"]
  ];
  let source = clean;
  let result = "";
  const letters = {
    a: "×", b: "×‘", c: "×§", d: "×“", e: "×¢", f: "×¤", g: "×’",
    h: "×”", i: "×™", j: "×™", k: "×§", l: "×œ", m: "×ž", n: "× ",
    o: "×•", p: "×¤", q: "×§", r: "×¨", s: "×¡", t: "×˜", u: "×•",
    v: "×•", w: "×•", x: "×§×¡", y: "×™", z: "×–"
  };

  while (source) {
    const match = clusters.find(([latin]) => source.startsWith(latin));
    if (match) {
      result += match[1];
      source = source.slice(match[0].length);
    } else {
      result += letters[source[0]] || "";
      source = source.slice(1);
    }
  }
  return result;
}

function getHebrewRabbiLabel(r) {
  if (r._hebrewMapLabel) return r._hebrewMapLabel;
  const candidates = [r.hebrew_name, r.name_he, r.hebrew, r.base_name, r.name];
  let hebrew = candidates.find(value => /[\u0590-\u05ff]/.test(String(value || "")));

  if (hebrew) {
    hebrew = String(hebrew)
      .replace(/\([^)]*[A-Za-z][^)]*\)/g, " ")
      .replace(/[A-Za-z][A-Za-z .'â€™-]*/g, " ")
      .replace(/^\s*(?:×¨×‘×™|×”×¨×‘|×¨[×³']?)\s+/u, "")
      .replace(/\s+/g, " ").trim();
  } else {
    const english = String(r.base_name || r.name || "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/^\s*(?:rabbi|rav|r['â€™]?)\s+/i, "").trim();
    hebrew = english.split(/[\s-]+/).map(transliterateNameWord).filter(Boolean).join(" ");
  }

  r._hebrewMapLabel = `×¨×³ ${hebrew || "×œ×œ× ×©×"}`;
  return r._hebrewMapLabel;
}

function getMapEntityLabel(r, y) {
  return r._entityKind === "rabbi" ? getHebrewRabbiLabel(r) : getDisplayName(r, y);
}

function buildEntityPopup(
  entities,
  year
) {
  const y = Number(year);

  if (
    entities.length > 1
  ) {
    const imgRow =
      entities.map(
        (r, idx) => {
          const imgSrc =
            r.img ||
            r.image ||
            "";

          if (!imgSrc) {
            return "";
          }

          return `<img src="${imgSrc}" loading="lazy" decoding="async"
            title="${getDisplayName(r, y)}"
            class="rabbi-popup-img"
            data-rabbi-index="${idx}"
            style="width:70px;height:70px;object-fit:cover;border-radius:50%;border:1px solid #333;margin:0 4px;cursor:pointer;">`;
        }
      ).join("");

    const details =
      entities.map(
        r => {
          const yearsStr =
            getYearsText(r);

          const ageText =
            getAgeText(
              r,
              y
            );
          const titleText = getEntityTitle(r, y);

          return `
            <div style="margin-top:6px;">
              <strong>${escapeHTML(getDisplayName(r, y))}</strong>
              ${titleText ? `<div class="entity-popup-title">${escapeHTML(titleText)}</div>` : ""}
              ${yearsStr}${ageText ? " â€” " + ageText : ""}<br>
              ${r.bio || ""}
            </div>
          `;
        }
      ).join("<hr>");

    return buildPopup(`
      <div style="text-align:center;margin-bottom:8px;">
        ${imgRow}
      </div>
      ${details}
    `);
  }

  const r = entities[0];

  const imgSrc =
    r.img ||
    r.image ||
    "";

  const imgHtml =
    imgSrc
      ? `<div style="margin-bottom:6px;">
          <img src="${imgSrc}" loading="lazy" decoding="async"
          style="max-width:150px;max-height:150px;border-radius:8px;border:1px solid #333;">
        </div>`
      : "";

  const yearsStr =
    getYearsText(r);

  const ageText =
    getAgeText(
      r,
      y
    );
  const titleText = getEntityTitle(r, y);

  return buildPopup(`
    ${imgHtml}
    <strong>${escapeHTML(getDisplayName(r, y))}</strong>
    ${titleText ? `<div class="entity-popup-title">${escapeHTML(titleText)}</div>` : ""}
    ${yearsStr}${ageText ? " â€” " + ageText : ""}<br>
    ${r.bio || ""}
  `);
}

function isFollowedRabbi(r) {
  return !!(
    followActive &&
    followedRabbi &&
    r &&
    r.name === followedRabbi.name
  );
}

function getFollowTravelScale(r) {
  if (
    !isFollowedRabbi(r) ||
    !map._isFollowTravel
  ) {
    return 1;
  }

  const zoom = map.getZoom();

  if (zoom >= RABBI_MIN_ZOOM) {
    return 1;
  }

  return Math.min(
    1.65,
    1 + (RABBI_MIN_ZOOM - Math.max(3, zoom)) * 0.16
  );
}

function buildSingleHTML(
  r,
  y
) {
  const color =
    getEntityColor(r.name);

  const imgSrc =
    r.img ||
    r.image ||
    "";

  const ageText =
    getAgeText(
      r,
      y
    );

  const ageLabel =
    ageText &&
    ageText.startsWith("age ")
      ? ` (${ageText.replace("age ", "")})`
      : "";

  const followed =
    isFollowedRabbi(r);

  const travelScale =
    getFollowTravelScale(r);

  const imageSize =
    40 * RABBI_SCALE;

  const dotSize =
    20 * RABBI_SCALE;

  const selectionShadow =
    followed
      ? "0 0 0 3px rgba(255,255,255,0.98), 0 0 0 6px rgba(218,165,32,0.95), 0 5px 16px rgba(0,0,0,0.55)"
      : "none";

  const baseImg =
    SHOW_RABBI_PICTURES && imgSrc
      ? `<img src="${imgSrc}" loading="lazy" decoding="async"
          class="rabbi-single-img"
          style="pointer-events:auto;cursor:pointer;width:${imageSize}px;height:${imageSize}px;object-fit:cover;border-radius:50%;border:1px solid #333;box-shadow:${selectionShadow};">`
      : `<div
          class="rabbi-single-img"
          style="pointer-events:auto;cursor:pointer;width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${color};box-shadow:${selectionShadow};">
        </div>`;

  const labelShadow =
    followed
      ? "0 0 0 2px rgba(255,255,255,0.98), 0 0 0 4px rgba(218,165,32,0.95), 0 4px 12px rgba(0,0,0,0.55)"
      : "0 3px 10px rgba(0,0,0,0.6)";

  const nameHtml =
    SHOW_RABBI_NAMES
      ? `<div
          class="rabbi-label rabbi-single-name"
          style="
            pointer-events:auto;
            cursor:pointer;
            background:${color};
            white-space:nowrap;
            margin:0;
            font-size:${Math.max(2, 9 * RABBI_SCALE)}px !important;
            line-height:1.1;
            padding:${1.5 * RABBI_SCALE}px ${5 * RABBI_SCALE}px;
            box-shadow:${labelShadow};
          ">
          ${getMapEntityLabel(r, y)}${ageLabel}
        </div>`
      : "";

  return `
    <div
      class="rabbi-single-root"
      style="
        display:flex;
        flex-direction:column-reverse;
        align-items:center;
        gap:${5 * RABBI_SCALE}px;
        transform:scale(${travelScale});
        transform-origin:center bottom;
        transition:transform 0.25s ease;
      ">
      ${baseImg}
      ${nameHtml}
    </div>
  `;
}

function buildGroupHTML(
  rs,
  y
) {
  const groupSize =
    40 * RABBI_SCALE;

  const baseImg =
    SHOW_RABBI_PICTURES && !window.__EMBEDDED_DATA__
      ? `<img src="https://upload.wikimedia.org/wikipedia/commons/8/81/%D7%99%D7%A9%D7%99%D7%91%D7%AA_%D7%94%D7%A0%D7%98%D7%A2_%D7%A9%D7%95%D7%A8%D7%A7_%D7%9E%D7%98%D7%A9%D7%90%D7%98%D7%90_%D7%A8%D7%91%D7%99_%D7%A9%D7%A8%D7%92%D7%90_%D7%A6%D7%91%D7%99_%D7%98%D7%A2%D7%A0%D7%A2%D7%A0%D7%91%D7%95%D7%99%D7%9D.jpg" loading="lazy" decoding="async"
      class="rabbi-group-img"
      style="
        pointer-events:auto;
        cursor:pointer;
        width:${groupSize}px;
        height:${groupSize}px;
        object-fit:cover;
        border-radius:50%;
        border:1px solid #333;
      ">`
      : `<div
          class="rabbi-group-img"
          style="
            width:${groupSize}px;
            height:${groupSize}px;
            border-radius:50%;
            background:#777;
            border:1px solid #333;
          "
        ></div>`;

  let namesHTML =
    SHOW_RABBI_NAMES
      ? `<div
          class="stacked-names"
          style="
            display:flex;
            flex-direction:column;
            align-items:center;
            margin-top:${4 * RABBI_SCALE}px;
          ">`
      : "";

  rs.forEach(
    (r, idx) => {
      const color =
        getEntityColor(r.name);

      const ageText =
        getAgeText(
          r,
          y
        );

      const ageLabel =
        ageText &&
        ageText.startsWith("age ")
          ? ` (${ageText.replace("age ", "")})`
          : "";

      if (
        SHOW_RABBI_NAMES
      ) {
        namesHTML += `
          <div
            class="rabbi-label rabbi-name"
            data-rabbi-index="${idx}"
            style="
              pointer-events:auto;
              cursor:pointer;
              background:${color};
              white-space:nowrap;
              font-size:${Math.max(2, 9 * RABBI_SCALE)}px !important;
              line-height:1.1;
            ">
            ${getMapEntityLabel(r, y)}${ageLabel}
          </div>
        `;
      }
    }
  );

  if (
    SHOW_RABBI_NAMES
  ) {
    namesHTML += `</div>`;
  }

  return `
    <div
      style="
        pointer-events:none;
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:${2 * RABBI_SCALE}px;
      ">
      ${baseImg}
      ${namesHTML}
    </div>
  `;
}

async function drawBorders(
  y,
  token
) {
  const validYear =
    await findAvailableBorderYear(y);

  if (
    token !== showToken
  ) {
    return false;
  }

  if (
    validYear === null
  ) {
    return true;
  }

  const borderData =
    bordersEuropeEnhanced[validYear];

  if (!borderData) {
    return true;
  }

  if (
    validYear !== currentBorderYear
  ) {
    const previousLayer = layer;
    const nextLayer =
      L.geoJSON(
        borderData,
        {
          pane: "bordersPane",
          style: colour,
          renderer: borderRenderer,
          interactive: true,

          onEachFeature: (
            f,
            lyr
          ) => {
            const name =
              f.properties?.Name ||
              f.properties?.NAME ||
              f.properties?.name ||
              f.properties?.admin ||
              "Unknown";

            lyr.bindTooltip(
              name,
              {
                sticky: true,
                direction: "top",
                opacity: 0.96,
                className: "country-tooltip"
              }
            );

            lyr.on({
              mouseover: e => {
                e.target.setStyle({
                  weight: 1.8,
                  color: "rgba(0,0,0,0.9)",
                  fillOpacity: 0.42
                });

                e.target.openTooltip(
                  e.latlng
                );
              },

              mouseout: e => {
                if (layer) {
                  layer.resetStyle(
                    e.target
                  );
                }

                e.target.closeTooltip();
              },

              click: e => {
                lyr.bindPopup(
                  `<b>${name}</b>`
                ).openPopup(
                  e.latlng
                );
              }
            });
          }
        }
      );

    if (previousLayer && map.hasLayer(previousLayer)) {
      map.removeLayer(previousLayer);
    }

    nextLayer.addTo(map);
    layer = nextLayer;

    currentBorderYear =
      validYear;
  }

  return true;
}

function drawCities(y) {
  const nextVisible = new Set();
  const zoom = map.getZoom();
  const visibleBounds = map.getBounds().pad(0.25);

  cityBuckets.forEach((cities, labelZoom) => {
    if (zoom < labelZoom) return;
    cities.forEach(city => {
      if (
        city._position &&
        visibleBounds.contains(city._position) &&
        Number.isFinite(Number(city.founding)) &&
        Number(city.founding) <= Number(y)
      ) {
        nextVisible.add(city);
      }
    });
  });

  visibleCities.forEach(city => {
    if (!nextVisible.has(city) && city._marker && map.hasLayer(city._marker)) {
      map.removeLayer(city._marker);
    }
  });

  nextVisible.forEach(city => {
    if (!city._marker) {
      city._marker = L.marker(city._position, {
        icon: L.divIcon({
          className: `city city-zoom-${city._labelZoom}`,
          html: city.name,
          iconSize: [100, 20]
        }),
        interactive: false,
        keyboard: false
      });
    }
    if (!map.hasLayer(city._marker)) city._marker.addTo(map);
    city._marker.setOpacity(1);
  });

  visibleCities = nextVisible;
}

function drawBattles(
  y,
  eventsList
) {
  BATTLES.forEach(
    b => {
      const position =
        getRecordLatLng(b);

      if (!position) return;

      if (!b._marker) {
        b._marker =
          L.marker(
            position,
            {
              icon: L.divIcon({
                html: "âš”ï¸",
                className: "",
                iconSize: [24, 24]
              }),

              zIndexOffset: 5000,
              keyboard: false
            }
          )
          .bindPopup(
            buildPopup(
              `<strong>${b.name}</strong><br>${b.note || b.event || ""}`
            )
          )
          .addTo(map);
      }

      if (!b._label) {
        b._label =
          L.marker(
            position,
            {
              icon: L.divIcon({
                className: "label-text",
                html: b.name,
                iconSize: null
              }),

              interactive: false,
              zIndexOffset: 5000,
              keyboard: false
            }
          ).addTo(map);
      }

      const visible =
        filters.battles.checked &&
        Number(b.year) === Number(y);

      b._marker.setOpacity(
        visible ? 1 : 0
      );

      b._label.setOpacity(
        visible ? 1 : 0
      );

      if (visible) {
        eventsList.push(
          `âš”ï¸ ${b.name} â€” ${b.note || b.event || ""}`
        );
      }
    }
  );
}

function buildRegionReferences(region) {
  const references = Array.isArray(region.references) ? region.references : [];
  if (references.length) {
    const links = references.map(reference => {
      const title = escapeHTML(reference.title || reference.url || "Reference");
      const url = String(reference.url || "");
      return /^https?:\/\//i.test(url)
        ? `<li><a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${title}</a></li>`
        : `<li>${title}</li>`;
    }).join("");
    return `<div class="region-references"><strong>References</strong><ul>${links}</ul></div>`;
  }

  if (Array.isArray(region.sources) && region.sources.length) {
    return `<div class="region-references"><strong>References</strong><ul>${region.sources.map(source => `<li>${escapeHTML(source)}</li>`).join("")}</ul></div>`;
  }
  return '<div class="region-references region-references-missing">No references have been added yet.</div>';
}

function buildRegionPopup(region) {
  return buildPopup(
    `<div class="region-popup"><strong>${escapeHTML(region.name)}</strong>`
    + `<div class="region-description">${region.note || "No description has been added yet."}</div>`
    + `${region.certainty ? `<div class="region-confidence">Boundary confidence: ${escapeHTML(region.certainty)}</div>` : ""}`
    + buildRegionReferences(region)
    + `<small>${region.start_year}â€“${region.end_year}</small></div>`
  );
}

function drawTemporaryRegions(y, eventsList) {
  TEMPORARY_REGIONS.forEach(region => {
    const points = region.latlng;
    if (!Array.isArray(points) || points.length < 3) return;

    if (!region._polygon) {
      const colour = region.colour || "#8b1e3f";
      region._polygon = L.polygon(points, {
        pane: "bordersPane",
        color: colour,
        weight: 2,
        fillColor: colour,
        fillOpacity: 0.24,
        dashArray: "7 5"
      })
        .bindTooltip(region.name, {
          sticky: true,
          direction: "top",
          opacity: 0.96,
          className: "country-tooltip"
        })
        .bindPopup(buildRegionPopup(region))
        .on({
          mouseover: event => {
            event.target.setStyle({
              weight: 1.8,
              color: "rgba(0,0,0,0.9)",
              fillOpacity: 0.42
            });
            event.target.openTooltip(event.latlng);
          },
          mouseout: event => {
            event.target.setStyle({
              weight: 2,
              color: colour,
              fillOpacity: 0.24
            });
            event.target.closeTooltip();
          }
        })
        .addTo(map);
    }

    if (!region._label) {
      region._label = L.marker(region._polygon.getBounds().getCenter(), {
        icon: L.divIcon({
          className: "temporary-region-label",
          html: escapeHTML(region.name),
          iconSize: null
        }),
        interactive: true,
        keyboard: false,
        zIndexOffset: 4500
      })
        .on("click", () => region._polygon.openPopup(region._label.getLatLng()))
        .addTo(map);
    }

    const visible = filters.temporaryRegions.checked
      && Number(y) >= Number(region.start_year)
      && Number(y) <= Number(region.end_year);

    region._polygon.setStyle({
      opacity: visible ? 1 : 0,
      fillOpacity: visible ? 0.24 : 0
    });
    region._label.setOpacity(visible ? 1 : 0);

    if (visible) {
      eventsList.push(`${region.name} â€” ${region.note || ""}`);
    }
  });
}

function getEventSymbol(ev) {
  const tags = Array.isArray(ev.tags) ? ev.tags.join(" ") : String(ev.tags || "");
  const searchable = [ev.id, ev.name, ev.category, tags, ev.note, ev.event]
    .filter(Boolean).join(" ").toLowerCase();

  const isExpulsion =
    ev.category === "expulsion_deportation" ||
    /\b(expulsion|expulsions|expelled|expels|deportation|deported)\b/.test(searchable) ||
    /\bexpulsion_layer\b/.test(searchable);
  if (isExpulsion) return { text: "âœ•", className: "expulsion-symbol" };

  const isPogromOrKilling =
    /\b(pogrom|pogroms|massacre|massacres|massacred|murder|murdered|killing|killings|killed|slaughter|slaughtered)\b/.test(searchable) ||
    /\bpersecution_pogrom_massacre\b/.test(searchable);
  if (isPogromOrKilling) return { text: "ðŸ”¥", className: "fire-symbol" };

  return ev.emoji
    ? { text: ev.emoji, className: "default-event-symbol" }
    : null;
}

function drawEvents(
  y,
  eventsList
) {
  const visibleEvents = [];
  const eventsForYear = [
    ...(eventsByYear.get(Number(y)) || []),
    ...(sefarimByYear.get(Number(y)) || [])
  ];
  const currentEventSet = new Set(eventsForYear);

  visibleMapEvents.forEach(ev => {
    if (currentEventSet.has(ev)) return;
    if (ev._marker && map.hasLayer(ev._marker)) map.removeLayer(ev._marker);
    if (ev._label && map.hasLayer(ev._label)) map.removeLayer(ev._label);
    if (ev._leaderLine && map.hasLayer(ev._leaderLine)) map.removeLayer(ev._leaderLine);
    setLayerClickable(ev._marker, false);
    setLayerClickable(ev._label, false);
    ev._marker?.unbindPopup();
    ev._label?.unbindPopup();
    if (ev._polygon) {
      ev._polygon.setStyle({ opacity: 0, fillOpacity: 0 });
    }
  });

  eventsForYear.forEach(
    ev => {
      const isSefarim = ev._isSefer;

      const paneName =
        isSefarim
          ? "sefarimPane"
          : "markerPane";

      if (
        ev._position &&
        !ev._marker
      ) {
        const position =
          ev._position;

        const eventSymbol = ev._symbol;
        const iconHTML =
          eventSymbol
            ? `<div class="event-symbol ${eventSymbol.className}">${eventSymbol.text}</div>`
            : ev.img
              ? `<img src="${ev.img}" loading="lazy" decoding="async" style="width:30px;height:30px;object-fit:contain;">`
              : `<div style="font-size:20px;">ðŸ“</div>`;

        ev._marker =
          L.marker(
            position,
            {
              pane: paneName,

              zIndexOffset:
                isSefarim
                  ? 10000
                  : 0,

              icon: L.divIcon({
                html: iconHTML,
                className: "",
                iconSize: [32, 32],
                iconAnchor: [16, 16],
                popupAnchor: [0, -16]
              }),

              keyboard: false
            }
          ).addTo(map);
      }

      if (
        ev._position &&
        !ev._label
      ) {
        const position =
          ev._position;

        ev._label =
          L.marker(
            position,
            {
              pane: "eventLabelsPane",

              zIndexOffset:
                isSefarim
                  ? 10000
                  : 0,

              icon: L.divIcon({
                className: "label-text event-label",
                html: `<span class="event-label-drag-area" title="Drag to reposition this ${isSefarim ? "sefer" : "event"}"><span class="event-label-handle">â—</span><span>${escapeHTML(cleanRecordName(ev.name))}</span></span>`,
                iconSize: [160, 24],
                iconAnchor: [0, 10]
              }),

              draggable: true,
              autoPan: false,
              riseOnHover: true,
              riseOffset: 2000,
              interactive: true,
              keyboard: false
            }
          )
          .on({
            dragstart: () => {
              ev._labelPlaced = true;
              ev._label.closePopup?.();
              ev._label.getElement?.()?.classList.add("event-label-dragging");
            },
            drag: () => updateEventLeaderLine(ev, true),
            dragend: () => {
              ev._labelPlaced = true;
              ev._label.getElement?.()?.classList.remove("event-label-dragging");
              updateEventLeaderLine(ev, true);
            }
          })
          .addTo(map);
      }

      const visible = isSefarim
        ? filters.sefarim.checked
        : filters.events.checked;

      const popupHTML = isSefarim
        ? `<div class="sefer-popup"><strong>ðŸ“– ${escapeHTML(cleanRecordName(ev.name))}</strong>${Number.isFinite(Number(ev.year ?? ev.start_year)) ? `<br><small>${escapeHTML(ev.year ?? ev.start_year)}</small>` : ""}<div class="sefer-popup-description">${ev.note || ev.event || "No further information is available for this book yet."}</div>${ev.source ? `<small>Source: ${escapeHTML(ev.source)}</small>` : ""}<button class="sefer-sections-button" data-sefer-id="${escapeHTML(ev.id || "")}">Open book sections</button></div>`
        : `<strong>${ev.name}</strong><br>${ev.note || ev.event || ""}${ev.source ? `<br><small>Source: ${ev.source}</small>` : ""}`;

      if (visible) {
        if (ev._marker && !map.hasLayer(ev._marker)) ev._marker.addTo(map);
        if (ev._label && !map.hasLayer(ev._label)) ev._label.addTo(map);
        ev._label?.dragging?.enable();
      } else {
        if (ev._marker && map.hasLayer(ev._marker)) map.removeLayer(ev._marker);
        if (ev._label && map.hasLayer(ev._label)) map.removeLayer(ev._label);
        if (ev._leaderLine && map.hasLayer(ev._leaderLine)) map.removeLayer(ev._leaderLine);
      }

      if (ev._marker) {
        ev._marker.setOpacity(
          visible ? 1 : 0
        );

        setLayerClickable(
          ev._marker,
          visible
        );

        if (visible) {
          ev._marker.bindPopup(popupHTML);
        } else {
          ev._marker.unbindPopup();
        }
      }

      if (ev._label) {
        ev._label.setOpacity(
          visible ? 1 : 0
        );

        const labelElement = ev._label.getElement?.();
        if (labelElement) labelElement.style.pointerEvents = "none";

        if (visible) {
          ev._label.bindPopup(popupHTML);
        } else {
          ev._label.unbindPopup();
        }
      }

      if (ev._polygon) {
        ev._polygon.setStyle({
          opacity:
            visible ? 1 : 0,

          fillOpacity:
            visible ? 0.2 : 0
        });
      }

      if (visible) {
        visibleEvents.push(ev);
        if (!isSefarim) {
          eventsList.push(
            `${ev._symbol?.text || "ðŸ“"} ${ev.name} â€” ${ev.note || ev.event || ""}`
          );
        }
      }
    }
  );

  visibleMapEvents = visibleEvents;
  scheduleEventLabelLayout();
}

function drawShuls(
  y,
  animate,
  eventsList
) {
  SHULS.forEach(
    s => {
      if (!s._marker) {
        const color =
          getEntityColor(
            s.name
          );

        const SHUL_IMG_SIZE =
          60;

        const iconHTML =
          s.img
            ? `<img src="${s.img}" style="width:${SHUL_IMG_SIZE}px;height:${SHUL_IMG_SIZE}px;border-radius:6px;border:1px solid #333;">`
            : s.emoji
              ? `<div style="font-size:${SHUL_IMG_SIZE * 0.6}px;line-height:1;">${s.emoji}</div>`
              : `<div style="width:${SHUL_IMG_SIZE}px;height:${SHUL_IMG_SIZE}px;background:${color};border-radius:6px;border:1px solid #333;"></div>`;

        s._marker =
          L.marker(
            [0, 0],
            {
              pane: "shulsPane",
              keyboard: false,

              icon: L.divIcon({
                html: `
                  <div
                    style="
                      pointer-events:none;
                      display:flex;
                      flex-direction:column;
                      align-items:center;
                    ">
                    <div
                      class="rabbi-label"
                      style="
                        pointer-events:auto;
                        cursor:pointer;
                        position:absolute;
                        top:-22px;
                        background:#ddd;
                        color:#000;
                        white-space:nowrap;
                      ">
                      ${s.name}
                    </div>

                    <div style="pointer-events:none;">
                      ${iconHTML}
                    </div>
                  </div>
                `,

                className: "",

                iconSize: [
                  SHUL_IMG_SIZE,
                  SHUL_IMG_SIZE
                ],

                iconAnchor: [
                  SHUL_IMG_SIZE / 2,
                  SHUL_IMG_SIZE / 2
                ]
              })
            }
          )
          .bindPopup(
            () =>
              buildEntityPopup(
                [s],
                currentYear
              )
          )
          .addTo(map);
      }

      const alive =
        Number(y) >=
          Number(s.birth_year) &&
        Number(y) <=
          Number(s.death_year);

      const moves =
        SHULS_MOV[s.name] ||
        [];

      const pos =
        getPosition(
          moves,
          y
        ) ||
        getRecordLatLng(s);

      const visible =
        alive &&
        pos &&
        filters.shuls.checked &&
        map.getZoom() >=
          SHUL_MIN_ZOOM;

      if (visible) {
        const oldPos =
          s._marker.getLatLng();

        if (
          animate &&
          oldPos &&
          !map._isZoomingNow
        ) {
          animateMarker(
            s._marker,
            [
              oldPos.lat,
              oldPos.lng
            ],
            pos
          );

        } else {
          s._marker.setLatLng(
            pos
          );
        }

        s._marker.setOpacity(1);

        s._marker._displayYear =
          y;

        setLayerClickable(
          s._marker,
          true
        );

        const moveEvent =
          moves.find(
            mv =>
              Number(mv.year) === Number(y) &&
              mv.event
          );

        if (moveEvent) {
          eventsList.push(
            `â›ª ${s.name} â€” ${moveEvent.event}`
          );
        }

      } else {
        s._marker.setOpacity(0);
        s._marker.closePopup?.();

        setLayerClickable(
          s._marker,
          false
        );
      }
    }
  );
}

function renderRabbis(
  y,
  animate,
  eventsList = [],
  followOnly = false
) {
  const arrivals = [];

  PEOPLE
    .forEach(
      r => {
        const isRabbi = r._entityKind === "rabbi";

        const isPersonality = r._entityKind === "personality";

        const followed =
          isFollowedRabbi(r);

        if (
          followOnly &&
          !followed
        ) {
          return;
        }

        const alive =
          Number(y) >=
            Number(r.birth_year) &&
          Number(y) <= getEntityMapEndYear(r);

        const moves = r._movements || [];

        const pos =
          getPosition(
            moves,
            y
          ) ||
          getRecordLatLng(r);

        const normalFilterVisible =
          (
            isRabbi &&
            filters.rabbis.checked
          ) ||
          (
            isPersonality &&
            filters.personalities.checked
          );

        const visible =
          alive &&
          pos &&
          (
            followed ||
            normalFilterVisible
          );

        if (visible) {
          if (!r._marker) {
            r._marker =
              L.marker(
                pos,
                {
                  pane: "rabbisPane",

                  zIndexOffset:
                    followed
                      ? 25000
                      : 0,

                  icon:
                    L.divIcon({
                      html: "",
                      className:
                        "rabbi-img-icon"
                    }),

                  keyboard: false
                }
              )
              .bindPopup(
                () =>
                  buildEntityPopup(
                    [r],
                    r._marker?._displayYear ||
                    currentYear
                  )
              )
              .addTo(map);
          }

          r._marker.setZIndexOffset(
            followed
              ? 25000
              : 0
          );

          const oldPos =
            r._marker.getLatLng();

          const positionChanged =
            oldPos &&
            (
              Math.abs(
                oldPos.lat - pos[0]
              ) > 0.000001 ||
              Math.abs(
                oldPos.lng - pos[1]
              ) > 0.000001
            );

          if (
            animate &&
            positionChanged &&
            !map._isZoomingNow
          ) {
            animateMarker(
              r._marker,
              [
                oldPos.lat,
                oldPos.lng
              ],
              pos
            );

          } else {
            r._marker.setLatLng(
              pos
            );
          }

          r._marker.setOpacity(1);

          r._marker._displayYear =
            y;

          setLayerClickable(
            r._marker,
            true
          );

          r._marker.bindPopup(
            () =>
              buildEntityPopup(
                [r],
                r._marker?._displayYear ||
                currentYear
              )
          );

          const moveEvent = r._movementEventsByYear?.get(Number(y));

          const shouldShowMoveEvent =
            !!moveEvent &&
            (
              followActive
                ? followed
                : (
                    map.getZoom() >= RABBI_MIN_ZOOM &&
                    filters.rabbiEvents.checked
                  )
            );

          if (
            shouldShowMoveEvent
          ) {
            if (
              !r._marker._eventPopup
            ) {
              r._marker._eventPopup =
                L.popup({
                  autoClose: false,
                  closeOnClick: false,
                  autoPan: false,
                  closeButton: false,
                  offset: L.point(0, -28),
                  className:
                    "compact-popup auto-event-popup"
                });
            }

            r._marker._eventPopup
              .setLatLng(pos)
              .setContent(
                `<div class="auto-event-content">
                  <strong>${getDisplayName(r, y)}</strong><br>
                  ${moveEvent.event}
                </div>`
              );

            if (
              !map.hasLayer(
                r._marker._eventPopup
              )
            ) {
              r._marker._eventPopup.addTo(
                map
              );
            }

            if (followed) {
              eventsList.unshift(
                `ðŸ‘¤ ${getDisplayName(r, y)} â€” ${moveEvent.event}`
              );
            }

          } else if (
            r._marker._eventPopup &&
            map.hasLayer(
              r._marker._eventPopup
            )
          ) {
            map.removeLayer(
              r._marker._eventPopup
            );
          }

          arrivals.push({
            r,
            pos
          });

        } else if (
          r._marker
        ) {
          r._marker.setOpacity(0);

          r._marker.closePopup?.();

          r._marker.unbindPopup();

          r._marker.setZIndexOffset(
            0
          );

          setLayerClickable(
            r._marker,
            false
          );

          if (
            r._marker._eventPopup &&
            map.hasLayer(
              r._marker._eventPopup
            )
          ) {
            map.removeLayer(
              r._marker._eventPopup
            );
          }
        }
      }
    );

  if (!followOnly) {
    groupVisibleRabbis(
      arrivals,
      y
    );
  }
}

function groupVisibleRabbis(
  arrivals,
  y
) {
  const groups = {};

  arrivals.forEach(
    entry => {
      const followed =
        isFollowedRabbi(
          entry.r
        );

      const key =
        followed
          ? `followed:${entry.r.name}`
          : `place:${entry.pos[0]},${entry.pos[1]}`;

      if (!groups[key]) {
        groups[key] = {
          pos: entry.pos,
          rabbis: []
        };
      }

      groups[key].rabbis.push(
        entry.r
      );
    }
  );

  const nextGroupKeys = new Set();
  activeGroupMarkers.clear();
  PEOPLE.forEach(r => { r._groupMarker = null; });

  Object.entries(groups)
    .forEach(
      ([groupKey, group]) => {
        const pos =
          group.pos;

        const rs =
          group.rabbis;

        if (
          rs.length > 1
        ) {
          nextGroupKeys.add(groupKey);
          rs.forEach(
            r => {
              if (r._marker) {
                r._marker.setOpacity(
                  0
                );

                r._marker.closePopup?.();

                r._marker.unbindPopup();

                setLayerClickable(
                  r._marker,
                  false
                );

                if (
                  r._marker._eventPopup &&
                  map.hasLayer(
                    r._marker._eventPopup
                  )
                ) {
                  map.removeLayer(
                    r._marker._eventPopup
                  );
                }
              }
            }
          );

          const groupHTML = buildGroupHTML(rs, y);
          let marker = groupMarkersByKey.get(groupKey);
          if (!marker) {
            marker = L.marker(
              pos,
              {
                pane: "rabbisPane",
                keyboard: false,

                icon:
                  L.divIcon({
                    html: groupHTML,

                    className:
                      "rabbi-img-icon",

                    iconSize: [
                      220 * RABBI_SCALE,
                      120 * RABBI_SCALE
                    ],

                    iconAnchor: [
                      110 * RABBI_SCALE,
                      20 * RABBI_SCALE
                    ],

                    popupAnchor: [
                      0,
                      -20 * RABBI_SCALE
                    ]
                  })
              }
            );
            groupMarkersByKey.set(groupKey, marker);
          } else {
            marker.setLatLng(pos);
            if (marker._iconHTML !== groupHTML) {
              marker.setIcon(L.divIcon({
                html: groupHTML,
                className: "rabbi-img-icon",
                iconSize: [220 * RABBI_SCALE, 120 * RABBI_SCALE],
                iconAnchor: [110 * RABBI_SCALE, 20 * RABBI_SCALE],
                popupAnchor: [0, -20 * RABBI_SCALE]
              }));
            }
          }
          marker._iconHTML = groupHTML;
          marker._groupRabbis = rs;
          if (!map.hasLayer(marker)) marker.addTo(map);

          activeGroupMarkers.add(marker);

          marker._displayYear =
            y;

          rs.forEach(
            r =>
              r._groupMarker =
                marker
          );

          setTimeout(
            () => {
              const el =
                marker.getElement();

              if (!el) {
                return;
              }

              el.style.pointerEvents =
                "auto";

              const img =
                el.querySelector(
                  ".rabbi-group-img"
                );

              if (img) {
                img.onclick =
                  e => {
                    e.stopPropagation();

                    const currentGroup = marker._groupRabbis || rs;
                    marker.bindPopup(
                      () =>
                        buildEntityPopup(
                          currentGroup,
                          marker._displayYear ||
                          currentYear
                        ),
                      {
                        autoPan: true
                      }
                    ).openPopup();
                  };
              }

              el.querySelectorAll(
                ".rabbi-name"
              ).forEach(
                (
                  lbl,
                  idx
                ) => {
                  lbl.onclick =
                    e => {
                      e.stopPropagation();

                      const r = (marker._groupRabbis || rs)[idx];

                      marker.bindPopup(
                        () =>
                          buildEntityPopup(
                            [r],
                            marker._displayYear ||
                            currentYear
                          ),
                        {
                          autoPan: true
                        }
                      ).openPopup();
                    };
                }
              );
            },
            0
          );

        } else {
          const r =
            rs[0];

          if (
            r._marker
          ) {
            r._marker.setOpacity(
              1
            );

            r._marker._displayYear =
              y;

            r._marker.setZIndexOffset(
              isFollowedRabbi(r)
                ? 25000
                : 0
            );

            const singleHTML = buildSingleHTML(r, y);
            if (r._marker._iconHTML !== singleHTML) {
              r._marker.setIcon(
                L.divIcon({
                  html: singleHTML,

                className:
                  "rabbi-img-icon",

                iconSize: [
                  220 * RABBI_SCALE,
                  90 * RABBI_SCALE
                ],

                iconAnchor: [
                  110 * RABBI_SCALE,
                  20 * RABBI_SCALE
                ],

                popupAnchor: [
                  0,
                  -20 * RABBI_SCALE
                ]
                })
              );
              r._marker._iconHTML = singleHTML;
            }

            if (!r._marker.getPopup?.()) {
              r._marker.bindPopup(
                () =>
                  buildEntityPopup(
                    [r],
                    r._marker?._displayYear || currentYear
                  )
              );
            }

            setTimeout(
              () =>
                setLayerClickable(
                  r._marker,
                  true
                ),
              0
            );
          }
        }
      }
    );

  groupMarkersByKey.forEach((marker, key) => {
    if (nextGroupKeys.has(key)) return;
    marker.closePopup?.();
    if (map.hasLayer(marker)) map.removeLayer(marker);
  });
}

function updateEventBox(events) {
  lastEventsList =
    events;

  if (!events.length) {
    eventToggle.style.display =
      "none";

    eventBox.style.display =
      "none";

    eventPanelOpen =
      false;

    return;
  }

  eventToggle.style.display =
    "block";

  eventToggle.textContent =
    `Events (${events.length}) ${
      eventPanelOpen
        ? "â–´"
        : "â–¾"
    }`;

  if (eventPanelOpen) {
    const nextHTML = "<ul>" + events.map(e => `<li>${e}</li>`).join("") + "</ul>";
    if (nextHTML !== lastEventPanelHTML) {
      eventBox.innerHTML = nextHTML;
      lastEventPanelHTML = nextHTML;
    }
  }

  eventBox.style.display =
    eventPanelOpen
      ? "block"
      : "none";
}

eventToggle.onclick =
  () => {
    eventPanelOpen =
      !eventPanelOpen;

    updateEventBox(
      lastEventsList
    );
  };

async function show(
  y,
  animate = false,
  options = {}
) {
  const token =
    ++showToken;

  const year =
    Number(y);

  currentYear =
    year;

  yearBox.textContent =
    year;

  const borderPromise = drawBorders(year, token);

  const eventsList = [];

  const travelOnly =
    options.travelOnly === true;

  if (!travelOnly) {
    drawCities(year);

    drawBattles(
      year,
      eventsList
    );

    drawTemporaryRegions(
      year,
      eventsList
    );

    drawEvents(
      year,
      eventsList
    );

    drawDemographics(year);
  }

  const shouldDrawPeople =
    !map._isDraggingSlider;

  if (
    shouldDrawPeople
  ) {
    if (!travelOnly) {
      drawShuls(
        year,
        animate,
        eventsList
      );
    }

    renderRabbis(
      year,
      animate,
      eventsList,
      travelOnly
    );
  }

  if (!travelOnly) {
    updateEventBox(
      eventsList
    );
  }

  if (options.nonBlockingBorder === true) {
    borderPromise
      .then(borderOk => {
        if (borderOk && token === showToken) preloadNearbyBorders(currentIndex);
      })
      .catch(error => console.warn("Border update failed:", error));
    return true;
  }

  const borderOk = await borderPromise;

  if (!borderOk || token !== showToken) {
    return false;
  }

  preloadNearbyBorders(
    currentIndex
  );

  return true;
}

function refreshRabbiMarkerSizes() {
  if (
    currentYear === null
  ) {
    return;
  }

  RABBIS
    .concat(PERSONALITIES)
    .forEach(
      r => {
        if (
          r._groupMarker
        ) {
          r._groupMarker.off();

          r._groupMarker.closePopup?.();

          map.removeLayer(
            r._groupMarker
          );

          r._groupMarker =
            null;
        }

        if (r._marker) {
          r._marker.setIcon(
            L.divIcon({
              html:
                buildSingleHTML(
                  r,
                  currentYear
                ),

              className:
                "rabbi-img-icon",

              iconSize: [
                220 * RABBI_SCALE,
                90 * RABBI_SCALE
              ],

              iconAnchor: [
                110 * RABBI_SCALE,
                20 * RABBI_SCALE
              ],

              popupAnchor: [
                0,
                -20 * RABBI_SCALE
              ]
            })
          );
        }
      }
    );

  renderRabbis(
    currentYear,
    false
  );
}

function updateFollowedRabbiTravelScale() {
  const marker =
    followedRabbi?._marker;

  const root =
    marker?.getElement?.()?.querySelector(
      ".rabbi-single-root"
    );

  if (root) {
    root.style.transform =
      `scale(${getFollowTravelScale(followedRabbi)})`;
  }
}

async function setupControlsAndDraw() {
  YEARS =
    YEARS.map(Number)
      .filter(Number.isFinite)
      .sort(
        (a, b) =>
          a - b
      );

  ACTIVE_YEARS =
    [...YEARS];

  fromInput.value =
    Math.min(...YEARS);

  toInput.value =
    Math.max(...YEARS);

  slider.max =
    ACTIVE_YEARS.length - 1;

  const defaultYear = 1900;
  currentIndex = ACTIVE_YEARS.reduce(
    (closestIndex, year, index) =>
      Math.abs(year - defaultYear) <
      Math.abs(ACTIVE_YEARS[closestIndex] - defaultYear)
        ? index
        : closestIndex,
    0
  );

  slider.value =
    currentIndex;

  if (
    rabbiSizeSlider
  ) {
    rabbiSizeSlider.addEventListener(
      "input",
      function () {
        RABBI_SCALE =
          parseFloat(
            this.value
          );

        refreshRabbiMarkerSizes();
      }
    );
  }

  if (
    toggleRabbiNames
  ) {
    toggleRabbiNames.addEventListener(
      "change",
      function () {
        SHOW_RABBI_NAMES =
          this.checked;

        refreshRabbiMarkerSizes();
      }
    );
  }

  if (
    toggleRabbiPictures
  ) {
    toggleRabbiPictures.addEventListener(
      "change",
      function () {
        SHOW_RABBI_PICTURES =
          this.checked;

        refreshRabbiMarkerSizes();
      }
    );
  }

  populateRabbiSearch();
  populateSeferSearch();
  populateFollowDropdown();
  setupFollowControls();
  setupSeferDetails();
  setupMobileControls();

  if (
    rabbiSearchButton &&
    rabbiSearchInput
  ) {
    rabbiSearchButton.addEventListener(
      "click",
      jumpToRabbi
    );

    rabbiSearchInput.addEventListener(
      "keydown",
      e => {
        if (
          e.key === "Enter"
        ) {
          jumpToRabbi();
        }
      }
    );
  }

  if (seferSearchButton && seferSearchInput) {
    seferSearchButton.addEventListener("click", jumpToSefer);
    seferSearchInput.addEventListener("keydown", event => {
      if (event.key === "Enter") jumpToSefer();
    });
  }

  slider.oninput =
    function () {
      pauseFollowPlayback(
        "Paused after manual timeline change"
      );

      map._isDraggingSlider =
        true;

      currentIndex =
        parseInt(
          this.value,
          10
        );

      const selectedYear =
        ACTIVE_YEARS[
          currentIndex
        ];

      yearBox.textContent =
        selectedYear;

      clearTimeout(
        sliderTimer
      );

      sliderTimer =
        setTimeout(
          async () => {
            map._isDraggingSlider =
              false;

            showToken++;

            await show(
              selectedYear,
              false
            );

            keepFollowedRabbiCentred(
              false
            );
          },
          100
        );
    };

  applyBtn.onclick =
    async function () {
      stopFollowPlayback({
        keepSelection: false,
        message:
          "Stopped after changing the year range"
      });

      const min =
        Number(
          fromInput.value
        );

      const max =
        Number(
          toInput.value
        );

      ACTIVE_YEARS =
        YEARS.filter(
          v =>
            v >= min &&
            v <= max
        );

      if (
        !ACTIVE_YEARS.length
      ) {
        return;
      }

      populateRabbiSearch();
      populateSeferSearch();
      populateFollowDropdown();

      slider.max =
        ACTIVE_YEARS.length - 1;

      currentIndex =
        Math.floor(
          ACTIVE_YEARS.length / 2
        );

      slider.value =
        currentIndex;

      await show(
        ACTIVE_YEARS[
          currentIndex
        ]
      );
    };

  const stepTimeline = direction => {
    pauseFollowPlayback("Paused after manual year change");
    const nextIndex = Math.max(0, Math.min(ACTIVE_YEARS.length - 1, currentIndex + direction));
    if (nextIndex === currentIndex) return;
    currentIndex = nextIndex;
    slider.value = currentIndex;
    show(ACTIVE_YEARS[currentIndex], true, { nonBlockingBorder: true });
    keepFollowedRabbiCentred(false);
  };

  const installHoldStepper = (button, direction) => {
    let repeatTimer = null;
    let ignoreClick = false;
    const stop = () => {
      if (repeatTimer) clearInterval(repeatTimer);
      repeatTimer = null;
    };
    button.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      ignoreClick = true;
      stepTimeline(direction);
      repeatTimer = setInterval(() => stepTimeline(direction), 200);
      button.setPointerCapture?.(event.pointerId);
    });
    ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"].forEach(type =>
      button.addEventListener(type, stop)
    );
    button.addEventListener("click", event => {
      if (ignoreClick) {
        ignoreClick = false;
        event.preventDefault();
        return;
      }
      stepTimeline(direction);
    });
  };

  installHoldStepper(document.getElementById("prevYear"), -1);
  installHoldStepper(document.getElementById("nextYear"), 1);

  const jumpToEnteredYear = () => {
    const requestedYear = Number(jumpYearInput?.value);
    if (!Number.isFinite(requestedYear) || !ACTIVE_YEARS.length) return;
    currentIndex = ACTIVE_YEARS.reduce((best, year, index) =>
      Math.abs(Number(year) - requestedYear) < Math.abs(Number(ACTIVE_YEARS[best]) - requestedYear)
        ? index
        : best, 0);
    slider.value = currentIndex;
    jumpYearInput.value = ACTIVE_YEARS[currentIndex];
    pauseFollowPlayback("Paused after jumping to a year");
    show(ACTIVE_YEARS[currentIndex], false, { nonBlockingBorder: true });
  };

  jumpYearButton?.addEventListener("click", jumpToEnteredYear);
  jumpYearInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") jumpToEnteredYear();
  });

  map.on(
    "zoomstart",
    () => {
      map._isZoomingNow =
        true;
    }
  );

  map.on(
    "zoom",
    updateFollowedRabbiTravelScale
  );

  map.on("moveend", () => {
    if (map._isZoomingNow || map._isFollowTravel || currentYear === null) return;
    drawCities(currentYear);
    if (map.getZoom() >= 6) drawDemographics(currentYear);
  });

  map.on(
    "zoomend",
    () => {
      map._isZoomingNow =
        false;

      // During the special Follow-a-Rabbi travel transition,
      // animateFollowTravel() controls the map. Do not redraw or
      // recenter here, otherwise Leaflet fights the animation.
      if (
        map._isFollowTravel
      ) {
        return;
      }

      if (
        currentYear !== null
      ) {
        drawCities(currentYear);
        drawDemographics(currentYear);
        drawShuls(currentYear, false, []);
        refreshRabbiEventPopupsForZoom();
        updateFollowedRabbiTravelScale();

        keepFollowedRabbiCentred(
          false
        );
      }
    }
  );

  Object.values(
    filters
  ).forEach(
    cb => {
      cb.addEventListener(
        "change",
        async () => {
          if (cb === filters.shuls && cb.checked) await loadDeferredShuls();
          if (cb === filters.demographics && cb.checked) await loadDeferredDemographics();
          if (
            currentYear !== null
          ) {
            await show(
              currentYear,
              false
            );
          }
        }
      );
    }
  );

  await show(
    ACTIVE_YEARS[
      currentIndex
    ]
  );

  // Begin the default visible layer immediately after the first usable frame.
  if (filters.shuls.checked) loadDeferredShuls();

  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => {
      loadDeferredDemographics();
    }, { timeout: 4000 });
  } else {
    setTimeout(() => {
      loadDeferredDemographics();
    }, 2500);
  }
}

function refreshRabbiEventPopupsForZoom() {
  const zoomAllowsEvents = map.getZoom() >= RABBI_MIN_ZOOM && filters.rabbiEvents.checked;

  PEOPLE.forEach(r => {
    const marker = r._marker;
    const moveEvent = r._movementEventsByYear?.get(Number(currentYear));
    const followed = isFollowedRabbi(r);
    const markerVisible = marker && marker.options.opacity !== 0 && !r._groupMarker;
    const shouldShow = markerVisible && moveEvent && (followActive ? followed : zoomAllowsEvents);

    if (!shouldShow) {
      if (marker?._eventPopup && map.hasLayer(marker._eventPopup)) {
        map.removeLayer(marker._eventPopup);
      }
      return;
    }

    if (!marker._eventPopup) {
      marker._eventPopup = L.popup({
        autoClose: false,
        closeOnClick: false,
        autoPan: false,
        closeButton: false,
        offset: L.point(0, -28),
        className: "compact-popup auto-event-popup"
      });
    }

    marker._eventPopup
      .setLatLng(marker.getLatLng())
      .setContent(`<div class="auto-event-content"><strong>${getDisplayName(r, currentYear)}</strong><br>${moveEvent.event}</div>`);
    if (!map.hasLayer(marker._eventPopup)) marker._eventPopup.addTo(map);
  });
}

async function main() {
  try {
    yearBox.textContent =
      "Loading data...";

    await loadInitialData();

    setupDemographicEditor();

    await setupControlsAndDraw();

  } catch (err) {
    console.error(err);

    const detail = err?.message || String(err);

    yearBox.textContent =
      "Error loading map data";

    alert(
      `Error loading map data: ${detail}`
    );
  }
}

function rabbiAppearsInActiveRange(r) {
  const minYear =
    Number(ACTIVE_YEARS[0]);

  const maxYear =
    Number(ACTIVE_YEARS[ACTIVE_YEARS.length - 1]);

  const birth =
    Number(
      r.birth_year
    );

  const mapEnd = getEntityMapEndYear(r);
  const death = Number.isFinite(mapEnd) ? mapEnd : maxYear;

  if (
    !Number.isFinite(birth)
  ) {
    return false;
  }

  return (
    birth <= maxYear &&
    death >= minYear
  );
}

function populateRabbiSearch() {
  if (
    !rabbiSearchList
  ) {
    return;
  }

  const fragment = document.createDocumentFragment();

  RABBIS
    .concat(PERSONALITIES)
    .filter(
      rabbiAppearsInActiveRange
    )
    .forEach(
      r => {
        searchValues(r).forEach((value, index) => {
          const option = document.createElement("option");
          option.value = value;
          if (index > 0) option.label = r.name;
          fragment.appendChild(option);
        });
      }
    );

  rabbiSearchList.replaceChildren(fragment);
}

function seferAppearsInActiveRange(sefer) {
  const minYear = Number(ACTIVE_YEARS[0]);
  const maxYear = Number(ACTIVE_YEARS[ACTIVE_YEARS.length - 1]);
  const start = Number(sefer.start_year ?? sefer.year);
  const end = Number(sefer.end_year ?? sefer.year ?? sefer.start_year);
  return Number.isFinite(start) && start <= maxYear && end >= minYear;
}

function populateSeferSearch() {
  if (!seferSearchList) return;
  const fragment = document.createDocumentFragment();
  SEFARIM.filter(seferAppearsInActiveRange).forEach(sefer => {
    searchValues(sefer).forEach((value, index) => {
      const option = document.createElement("option");
      option.value = value;
      if (index > 0) option.label = cleanRecordName(sefer.name);
      fragment.appendChild(option);
    });
  });
  seferSearchList.replaceChildren(fragment);
}

async function jumpToSefer() {
  const query = String(seferSearchInput?.value || "").trim();
  if (!query) return;

  const available = SEFARIM.filter(seferAppearsInActiveRange);
  const sefer = findApproximateRecord(available, query);
  if (!sefer) {
    alert("Sefer not found in the selected year range");
    return;
  }

  const targetYear = Number(sefer.year ?? sefer.start_year);
  currentIndex = ACTIVE_YEARS.reduce((best, year, index) =>
    Math.abs(Number(year) - targetYear) < Math.abs(Number(ACTIVE_YEARS[best]) - targetYear)
      ? index
      : best, 0);
  slider.value = currentIndex;
  filters.sefarim.checked = true;
  await show(ACTIVE_YEARS[currentIndex], false);

  if (sefer._position) {
    map.setView(sefer._position, Math.max(map.getZoom(), 8));
    requestAnimationFrame(() => sefer._marker?.openPopup());
  } else {
    sefer._marker?.openPopup();
  }
}

async function jumpToRabbi() {
  const query = rabbiSearchInput.value.trim();

  if (!query) {
    return;
  }

  const allPeople = PEOPLE;

  const r = findApproximateRecord(allPeople, query);

  if (!r) {
    alert(
      "Rabbi not found"
    );

    return;
  }

  const moves =
    (
      RABBIS_MOV[r.name] ||
      []
    ).concat(
      PERSONALITIES_MOV[r.name] ||
      []
    );

  const firstMoveYear =
    moves.length
      ? Number(
          moves[0].year
        )
      : Number(
          r.birth_year
        );

  const targetYear =
    firstMoveYear ||
    Number(
      r.birth_year
    );

  let nearestIndex =
    0;

  let smallestDiff =
    Infinity;

  ACTIVE_YEARS.forEach(
    (
      year,
      index
    ) => {
      const diff =
        Math.abs(
          Number(year) -
          targetYear
        );

      if (
        diff <
        smallestDiff
      ) {
        smallestDiff =
          diff;

        nearestIndex =
          index;
      }
    }
  );

  currentIndex =
    nearestIndex;

  slider.value =
    currentIndex;

  await show(
    ACTIVE_YEARS[
      currentIndex
    ],
    false
  );

  const pos =
    getPosition(
      moves,
      ACTIVE_YEARS[
        currentIndex
      ]
    ) ||
    getRecordLatLng(r);

  if (pos) {
    map.setView(
      pos,
      Math.max(
        map.getZoom(),
        8
      )
    );
  }
}


// ==========================
// FOLLOW A STORY MODE
// ==========================

function getFollowEntity(name) {
  const query = String(name || "").trim();
  if (!query) return null;
  return peopleByName.get(name) ||
    findApproximateRecord(PEOPLE, query) ||
    null;
}

function getFollowMovements(entity) {
  if (!entity) {
    return [];
  }

  if (followMovementCache.has(entity.name)) {
    return followMovementCache.get(entity.name);
  }

  const movements = [
    ...(
      RABBIS_MOV[
        entity.name
      ] ||
      []
    ),

    ...(
      PERSONALITIES_MOV[
        entity.name
      ] ||
      []
    )
  ]
  .filter(
    mv =>
      Number.isFinite(
        Number(mv.year)
      )
  )
  .sort(
    (a, b) =>
      Number(a.year) -
      Number(b.year)
  );

  followMovementCache.set(entity.name, movements);
  return movements;
}

function getFollowPosition(
  entity,
  year
) {
  if (!entity) {
    return null;
  }

  const moves =
    getFollowMovements(
      entity
    );

  return (
    getPosition(
      moves,
      year
    ) ||
    getRecordLatLng(entity)
  );
}

function getFollowSpeedMs() {
  const speed =
    document.getElementById(
      "storySpeed"
    );

  const value =
    Number(
      speed?.value
    );

  return (
    Number.isFinite(value) &&
    value >= 100
  )
    ? value
    : 1000;
}

function delay(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        Math.max(
          0,
          ms
        )
      )
  );
}

function updateFollowStatus(message) {
  const status =
    document.getElementById(
      "followStatus"
    );

  if (status) {
    status.textContent =
      message || "";
  }
}

function ensureFollowStatusElement() {
  const body =
    document.getElementById(
      "storyBody"
    );

  if (
    !body ||
    document.getElementById(
      "followStatus"
    )
  ) {
    return;
  }

  const status =
    document.createElement(
      "div"
    );

  status.id =
    "followStatus";

  status.style.cssText =
    [
      "margin-top:8px",
      "padding:7px 8px",
      "border-radius:7px",
      "background:rgba(255,255,255,0.7)",
      "font:12px/1.35 'Segoe UI',sans-serif",
      "color:#514638",
      "min-height:16px"
    ].join(";");

  status.textContent =
    "Choose a rabbi and press Follow.";

  body.appendChild(
    status
  );
}

function populateFollowDropdown() {
  const input =
    document.getElementById(
      "storyRabbiSelect"
    );
  const list = document.getElementById("storyRabbiOptions");

  if (!input || !list) {
    return;
  }

  const selectedName =
    followedRabbi?.name ||
    input.value;

  const fragment = document.createDocumentFragment();

  PEOPLE
    .filter(
      rabbiAppearsInActiveRange
    )
    .forEach(
      r => {
        searchValues(r).forEach((value, index) => {
          const option = document.createElement("option");
          option.value = value;
          if (index > 0) option.label = r.name;
          fragment.appendChild(option);
        });
      }
    );

  list.replaceChildren(fragment);
  input.value = selectedName;
}

function configureFollowSpeedOptions() {
  const speed =
    document.getElementById(
      "storySpeed"
    );

  if (!speed) {
    return;
  }

  const previous =
    Number(
      speed.value
    );

  speed.innerHTML =
    `
      <option value="250">0.25 seconds per year</option>
      <option value="500">0.5 seconds per year</option>
      <option value="1000">1 second per year</option>
      <option value="2000">2 seconds per year</option>
      <option value="3000">3 seconds per year</option>
    `;

  speed.value =
    [
      250,
      500,
      1000,
      2000,
      3000
    ].includes(
      previous
    )
      ? String(previous)
      : "1000";
}

function setupFollowControls() {
  const control =
    document.getElementById(
      "storyControl"
    );

  const header =
    document.getElementById(
      "storyHeader"
    );

  const arrow =
    document.getElementById(
      "storyDropdownArrow"
    );

  const select =
    document.getElementById(
      "storyRabbiSelect"
    );

  const followBtn =
    document.getElementById(
      "playStory"
    );

  const pauseBtn =
    document.getElementById(
      "pauseStory"
    );

  const stopBtn =
    document.getElementById(
      "stopStory"
    );

  if (
    header &&
    control
  ) {
    header.innerHTML =
      `<span>Follow a Story</span><span id="storyDropdownArrow">â–¾</span>`;

    const newArrow =
      document.getElementById(
        "storyDropdownArrow"
      );

    header.onclick =
      () => {
        control.classList.toggle(
          "open"
        );

        if (newArrow) {
          newArrow.textContent =
            control.classList.contains(
              "open"
            )
              ? "â–´"
              : "â–¾";
        }
      };

  } else if (
    arrow
  ) {
    arrow.textContent =
      "â–¾";
  }

  configureFollowSpeedOptions();

  ensureFollowStatusElement();

  if (followBtn) {
    followBtn.textContent =
      "Follow";

    followBtn.onclick =
      startOrResumeFollow;
  }

  if (pauseBtn) {
    pauseBtn.textContent =
      "Pause";

    pauseBtn.onclick =
      () =>
        pauseFollowPlayback(
          "Paused"
        );
  }

  if (stopBtn) {
    stopBtn.textContent =
      "Stop";

    stopBtn.onclick =
      () =>
        stopFollowPlayback({
          keepSelection: false,
          message: "Follow stopped"
        });
  }

  if (select) {
    select.onchange =
      () => {
        if (
          followActive ||
          followedRabbi
        ) {
          const newlySelectedName =
            select.value;

          stopFollowPlayback({
            keepSelection: false,
            message:
              "Selection changed"
          });

          select.value =
            newlySelectedName;
        }

        const selectedEntity = getFollowEntity(select.value);
        const selectedStart = selectedEntity
          ? findFollowStartIndex(selectedEntity)
          : -1;
        if (selectedEntity && selectedStart >= 0) {
          updateFollowStatus(`${selectedEntity.name} is ready to follow.`);
          preloadFollowWindow(selectedEntity, selectedStart, 4).catch(() => {});
        }
      };

    select.onkeydown = event => {
      if (event.key === "Enter") {
        event.preventDefault();
        startOrResumeFollow();
      }
    };
  }

  const oldPanel =
    document.getElementById(
      "storyPanel"
    );

  const oldDetail =
    document.getElementById(
      "storyDetailBox"
    );

  if (oldPanel) {
    oldPanel.style.display =
      "none";
  }

  if (oldDetail) {
    oldDetail.style.display =
      "none";
  }
}

function findFollowStartIndex(entity) {
  const moves =
    getFollowMovements(
      entity
    );

  const firstRecordedYear =
    moves.length
      ? Number(
          moves[0].year
        )
      : Number(
          entity.birth_year
        );

  const birthYear =
    Number(
      entity.birth_year
    );

  const startYear =
    Number.isFinite(
      firstRecordedYear
    )
      ? firstRecordedYear
      : birthYear;

  if (!ACTIVE_YEARS.length || !Number.isFinite(startYear)) return -1;

  let low = 0;
  let high = ACTIVE_YEARS.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Number(ACTIVE_YEARS[middle]) < startYear) low = middle + 1;
    else high = middle;
  }

  if (low >= ACTIVE_YEARS.length) return -1;
  const candidateYear = Number(ACTIVE_YEARS[low]);
  if (candidateYear > getEntityMapEndYear(entity)) return -1;
  return getFollowPosition(entity, candidateYear) ? low : -1;
}

function setupMobileControls() {
  const toggle = document.getElementById("mobileControlsToggle");
  const controls = document.getElementById("rightControls");
  if (!toggle || !controls) return;

  const mobileQuery = window.matchMedia("(max-width: 700px)");
  const setOpen = open => {
    const mobileOpen = mobileQuery.matches && open;
    document.body.classList.toggle("mobile-controls-open", mobileOpen);
    toggle.setAttribute("aria-expanded", String(mobileOpen));
    toggle.textContent = mobileOpen ? "Ã— Close options" : "â˜° Map options";
  };

  toggle.addEventListener("click", event => {
    event.stopPropagation();
    setOpen(!document.body.classList.contains("mobile-controls-open"));
  });

  controls.addEventListener("click", event => event.stopPropagation());
  document.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });

  const closeAfterAction = event => {
    if (!mobileQuery.matches) return;
    if (event.target.closest("#rabbiSearchButton, #seferSearchButton")) {
      requestAnimationFrame(() => setOpen(false));
    }
  };
  controls.addEventListener("click", closeAfterAction);
  mobileQuery.addEventListener?.("change", () => setOpen(false));
}

function latLngToTile(
  lat,
  lng,
  zoom
) {
  const n =
    Math.pow(
      2,
      zoom
    );

  const x =
    Math.floor(
      (
        (lng + 180) /
        360
      ) *
      n
    );

  const latRad =
    lat *
    Math.PI /
    180;

  const y =
    Math.floor(
      (
        1 -
        Math.asinh(
          Math.tan(
            latRad
          )
        ) /
        Math.PI
      ) /
      2 *
      n
    );

  return {
    x,
    y
  };
}

function preloadTileUrl(
  url,
  timeoutMs = 2500
) {
  if (window.__EMBEDDED_DATA__) return Promise.resolve();

  if (
    followTileCache.has(
      url
    )
  ) {
    return followTileCache.get(
      url
    );
  }

  const promise =
    new Promise(
      resolve => {
        const image =
          new Image();

        let finished =
          false;

        const finish =
          () => {
            if (finished) {
              return;
            }

            finished =
              true;

            resolve();
          };

        image.onload =
          finish;

        image.onerror =
          finish;

        image.src =
          url;

        setTimeout(
          finish,
          timeoutMs
        );
      }
    );

  followTileCache.set(
    url,
    promise
  );

  return promise;
}

async function preloadMapTiles(
  position,
  radius = 1,
  requestedZooms = null
) {
  if (!position) {
    return;
  }

  const zooms =
    requestedZooms?.length
      ? requestedZooms
      : [
          Math.max(
            8,
            Math.min(
              10,
              Math.round(
                map.getZoom() ||
                8
              )
            )
          )
        ];

  const requests = zooms.flatMap(
    zoom => {
      const safeZoom = Math.max(
        0,
        Math.min(
          19,
          Math.round(zoom)
        )
      );

      const tile =
        latLngToTile(
          Number(position[0]),
          Number(position[1]),
          safeZoom
        );

      return Array.from(
        {
          length: (radius * 2 + 1) ** 2
        },
        (_, index) => {
          const width =
            radius * 2 + 1;

          const dx =
            index % width - radius;

          const dy =
            Math.floor(index / width) - radius;

          const url =
            `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${safeZoom}/${tile.y + dy}/${tile.x + dx}`;

          return preloadTileUrl(url);
        }
      );
    }
  );

  await Promise.all(
    requests
  );
}

async function preloadFollowTravelTiles(
  fromPosition,
  toPosition,
  travelZoom,
  originalZoom
) {
  const lowZoom =
    Math.max(
      3,
      Math.floor(travelZoom) - 1
    );

  const highZoom =
    Math.min(
      19,
      Math.ceil(originalZoom) + 1
    );

  // Cover the visual keyframes without flooding the network with every
  // intermediate zoom level.
  const zooms = [...new Set([
    lowZoom,
    Math.max(lowZoom, Math.min(highZoom, Math.round(travelZoom))),
    highZoom
  ])];

  const midpoint = [
    (Number(fromPosition[0]) + Number(toPosition[0])) / 2,
    (Number(fromPosition[1]) + Number(toPosition[1])) / 2
  ];

  await Promise.all(
    [fromPosition, midpoint, toPosition].map(
      position =>
        preloadMapTiles(
          position,
          1,
          zooms
        )
    )
  );
}

function getNextMovementPosition(
  entity,
  afterYear
) {
  const nextMove =
    getFollowMovements(
      entity
    ).find(
      mv =>
        Number(mv.year) >
          Number(afterYear) &&
        !!getRecordLatLng(mv)
    );

  if (!nextMove) {
    return null;
  }

  return getRecordLatLng(nextMove);
}

async function preloadFollowStep(
  entity,
  year
) {
  const currentPosition =
    getFollowPosition(
      entity,
      year
    );

  const nextMovementPosition =
    getNextMovementPosition(
      entity,
      year
    );

  await Promise.all([
    findAvailableBorderYear(
      year
    ),

    preloadMapTiles(
      currentPosition,
      1
    ),

    nextMovementPosition
      ? preloadMapTiles(
          nextMovementPosition,
          1
        )
      : Promise.resolve()
  ]);
}

async function preloadFollowWindow(
  entity,
  startIndex,
  count = 4
) {
  const tasks = [];

  const seenPositions =
    new Set();

  for (
    let offset = 0;
    offset < count;
    offset++
  ) {
    const index =
      startIndex +
      offset;

    if (
      index < 0 ||
      index >= ACTIVE_YEARS.length
    ) {
      continue;
    }

    const year =
      ACTIVE_YEARS[
        index
      ];

    tasks.push(
      findAvailableBorderYear(
        year
      )
    );

    const position =
      getFollowPosition(
        entity,
        year
      );

    if (position) {
      const key =
        `${position[0]},${position[1]}`;

      if (
        !seenPositions.has(
          key
        )
      ) {
        seenPositions.add(
          key
        );

        tasks.push(
          preloadMapTiles(
            position,
            1
          )
        );
      }
    }
  }

  const nextMovementPosition =
    getNextMovementPosition(
      entity,
      ACTIVE_YEARS[
        startIndex
      ] ??
      currentYear
    );

  if (
    nextMovementPosition
  ) {
    tasks.push(
      preloadMapTiles(
        nextMovementPosition,
        1
      )
    );
  }

  await Promise.all(
    tasks
  );
}

function keepFollowedRabbiCentred(
  animate = true
) {
  if (
    !followedRabbi ||
    currentYear === null
  ) {
    return;
  }

  const position =
    getFollowPosition(
      followedRabbi,
      currentYear
    );

  if (!position) {
    return;
  }

  const targetZoom =
    Math.max(
      map.getZoom(),
      8
    );

  const speedMs =
    getFollowSpeedMs();

  if (
    map.getZoom() < 8
  ) {
    map.setView(
      position,
      targetZoom,
      {
        animate: false
      }
    );

  } else {
    map.panTo(
      position,
      {
        animate,

        duration:
          Math.min(
            0.75,
            Math.max(
              0.2,
              speedMs /
              1000 *
              0.55
            )
          ),

        easeLinearity:
          0.25,

        noMoveStart:
          true
      }
    );
  }

  followLastPosition =
    position;
}

async function startOrResumeFollow() {
  const select =
    document.getElementById(
      "storyRabbiSelect"
    );

  const selectedName =
    select?.value;

  if (!selectedName) {
    updateFollowStatus(
      "Select a rabbi first."
    );

    return;
  }

  if (
    followActive &&
    followPaused &&
    followedRabbi?.name ===
      selectedName
  ) {
    followPaused =
      false;

    updateFollowStatus(
      `Following ${followedRabbi.name} â€” ${currentYear}`
    );

    return;
  }

  if (
    followActive
  ) {
    stopFollowPlayback({
      keepSelection: false,
      message:
        "Changing followed rabbi"
    });
  }

  const entity =
    getFollowEntity(
      selectedName
    );

  if (!entity) {
    updateFollowStatus(
      "Rabbi not found."
    );

    return;
  }

  const startIndex =
    findFollowStartIndex(
      entity
    );

  if (
    startIndex < 0
  ) {
    updateFollowStatus(
      "This rabbi does not appear within the selected year range."
    );

    return;
  }

  followedRabbi =
    entity;

  followActive =
    true;

  followPaused =
    false;

  followLastPosition =
    null;

  const token =
    ++followRunToken;

  currentIndex =
    startIndex;

  slider.value =
    currentIndex;

  const speedMs =
    getFollowSpeedMs();

  MOVE_DURATION =
    Math.min(
      650,
      Math.max(
        180,
        speedMs * 0.55
      )
    );

  updateFollowStatus(
    `Loading ${entity.name} and the next map areaâ€¦`
  );

  preloadFollowWindow(
    entity,
    currentIndex,
    5
  ).catch(() => {});

  await show(
    ACTIVE_YEARS[
      currentIndex
    ],
    false,
    { nonBlockingBorder: true }
  );

  keepFollowedRabbiCentred(
    false
  );

  updateFollowStatus(
    `Following ${entity.name} â€” ${ACTIVE_YEARS[currentIndex]}`
  );

  runFollowTimeline(
    token
  );
}

function getFollowEventAtYear(
  entity,
  year
) {
  return (
    getFollowMovements(
      entity
    ).find(
      movement =>
        Number(movement.year) ===
          Number(year) &&
        movement.event
    ) ||
    null
  );
}


// ======================================================
// SMOOTH LOCATION-CHANGE ANIMATION
// ======================================================

function followPositionsDiffer(
  a,
  b
) {
  if (
    !a ||
    !b
  ) {
    return false;
  }

  return (
    Math.abs(
      Number(a[0]) -
      Number(b[0])
    ) > 0.000001 ||
    Math.abs(
      Number(a[1]) -
      Number(b[1])
    ) > 0.000001
  );
}

function runMapMove(
  action,
  timeoutMs = 5000
) {
  return new Promise(
    resolve => {
      let finished =
        false;

      let timer =
        null;

      const finish =
        () => {
          if (finished) {
            return;
          }

          finished =
            true;

          if (timer) {
            clearTimeout(
              timer
            );
          }

          map.off(
            "moveend",
            finish
          );

          resolve();
        };

      map.once(
        "moveend",
        finish
      );

      timer =
        setTimeout(
          finish,
          timeoutMs
        );

      action();
    }
  );
}

async function animateFollowTravel(
  entity,
  fromYear,
  toYear,
  token
) {
  const fromPosition =
    getFollowPosition(
      entity,
      fromYear
    );

  const toPosition =
    getFollowPosition(
      entity,
      toYear
    );

  if (
    !followPositionsDiffer(
      fromPosition,
      toPosition
    )
  ) {
    return false;
  }

  const normalSpeed =
    getFollowSpeedMs();

  const originalZoom =
    Math.max(
      8,
      map.getZoom()
    );

  const bounds =
    L.latLngBounds([
      fromPosition,
      toPosition
    ]);

  const boundsZoom =
    map.getBoundsZoom(
      bounds,
      false,
      L.point(
        180,
        140
      )
    );

  // Pull back at least two zoom levels where possible,
  // and further for long-distance journeys.
  const travelZoom =
    Math.max(
      3,
      Math.min(
        Math.max(
          3,
          Math.floor(
            originalZoom
          ) - 2
        ),

        Math.max(
          3,
          Math.floor(
            boundsZoom
          ) - 1
        )
      )
    );

  const zoomOutMs =
    Math.min(
      1800,
      Math.max(
        750,
        normalSpeed *
          1.1
      )
    );

  const travelMs =
    Math.min(
      5000,
      Math.max(
        1800,
        normalSpeed *
          2.8
      )
    );

  const zoomInMs =
    Math.min(
      1800,
      Math.max(
        750,
        normalSpeed *
          1.0
      )
    );

  map._isFollowTravel =
    true;

  try {
    updateFollowStatus(
      `Loading travel map â€” ${fromYear} â†’ ${toYear}`
    );

    await Promise.race([
      preloadFollowTravelTiles(
        fromPosition,
        toPosition,
        travelZoom,
        originalZoom
      ),
      delay(250)
    ]);

    if (
      !followActive ||
      token !== followRunToken
    ) {
      return true;
    }

    updateFollowStatus(
      `${entity.name} is moving â€” ${fromYear} â†’ ${toYear}`
    );

    // STEP 1:
    // Zoom out so both departure and destination
    // become visible.
    await runMapMove(
      () =>
        map.flyToBounds(
          bounds,
          {
            padding: [
              90,
              70
            ],

            maxZoom:
              travelZoom,

            animate:
              true,

            duration:
              zoomOutMs /
              1000
          }
        ),

      zoomOutMs +
        1200
    );

    if (
      !followActive ||
      token !== followRunToken
    ) {
      return true;
    }

    // STEP 2:
    // Slow the rabbi's actual marker movement.
    MOVE_DURATION =
      travelMs;

    let shown =
      await show(
        toYear,
        true,
        {
          travelOnly: true,
          nonBlockingBorder: true
        }
      );

    if (
      !shown &&
      followActive &&
      token === followRunToken
    ) {
      shown =
        await show(
          toYear,
          false,
          { nonBlockingBorder: true }
        );
    }

    if (
      !shown ||
      !followActive ||
      token !== followRunToken
    ) {
      return true;
    }

    // Pan the map toward the new location while the
    // rabbi marker itself travels across the map.
    const panPromise =
      runMapMove(
        () =>
          map.panTo(
            toPosition,
            {
              animate:
                true,

              duration:
                travelMs /
                1000,

              easeLinearity:
                0.18,

              noMoveStart:
                true
            }
          ),

        travelMs +
          1200
      );

    await Promise.all([
      panPromise,
      delay(
        travelMs +
        80
      )
    ]);

    if (
      !followActive ||
      token !== followRunToken
    ) {
      return true;
    }

    // STEP 3:
    // Once the rabbi reaches the new location,
    // smoothly zoom back in.
    await runMapMove(
      () =>
        map.flyTo(
          toPosition,
          originalZoom,
          {
            animate:
              true,

            duration:
              zoomInMs /
              1000,

            easeLinearity:
              0.2
          }
        ),

      zoomInMs +
        1200
    );

    if (
      !followActive ||
      token !== followRunToken
    ) {
      return true;
    }

    // Final precise redraw at destination.
    await show(
      toYear,
      false,
      { nonBlockingBorder: true }
    );

    followLastPosition =
      toPosition;

    return true;

  } finally {
    map._isFollowTravel =
      false;

    map._isZoomingNow =
      false;
  }
}


// ======================================================
// FOLLOW TIMELINE
// ======================================================

async function runFollowTimeline(token) {
  while (
    followActive &&
    token === followRunToken
  ) {
    if (
      followPaused
    ) {
      await delay(
        80
      );

      continue;
    }

    const current =
      Number(
        ACTIVE_YEARS[
          currentIndex
        ]
      );

    const death = getEntityMapEndYear(followedRabbi);

    if (
      currentIndex >=
        ACTIVE_YEARS.length - 1 ||
      current >= death
    ) {
      followActive =
        false;

      followPaused =
        false;

      updateFollowStatus(
        `Finished following ${
          followedRabbi?.name ||
          "rabbi"
        } at ${currentYear}.`
      );

      refreshRabbiMarkerSizes();

      return;
    }

    const nextIndex =
      currentIndex + 1;

    const nextYear =
      ACTIVE_YEARS[
        nextIndex
      ];

    const stepStart =
      performance.now();

    followStepStartedAt =
      stepStart;

    updateFollowStatus(
      `Preparing ${nextYear}â€¦`
    );

    preloadFollowStep(
      followedRabbi,
      nextYear
    ).catch(() => {});

    if (
      !followActive ||
      token !== followRunToken
    ) {
      return;
    }

    const rabbiEvent =
      getFollowEventAtYear(
        followedRabbi,
        nextYear
      );

    const fromPosition =
      getFollowPosition(
        followedRabbi,
        current
      );

    const toPosition =
      getFollowPosition(
        followedRabbi,
        nextYear
      );

    const changedLocation =
      followPositionsDiffer(
        fromPosition,
        toPosition
      );

    currentIndex =
      nextIndex;

    slider.value =
      currentIndex;

    const normalSpeed =
      getFollowSpeedMs();

    let shown =
      true;

    if (
      changedLocation
    ) {
      // A true latitude/longitude change receives
      // the cinematic travel sequence.
      shown =
        await animateFollowTravel(
          followedRabbi,
          current,
          nextYear,
          token
        );

    } else {
      // Ordinary years behave exactly as before.
      MOVE_DURATION =
        rabbiEvent
          ? Math.min(
              1800,
              Math.max(
                800,
                normalSpeed *
                  1.5
              )
            )
          : Math.min(
              650,
              Math.max(
                180,
                normalSpeed *
                  0.55
              )
            );

      shown =
        await show(
          nextYear,
          true,
          { nonBlockingBorder: true }
        );

      if (
        !shown &&
        followActive &&
        token === followRunToken
      ) {
        shown =
          await show(
            nextYear,
            false,
            { nonBlockingBorder: true }
          );
      }

      if (
        shown &&
        followActive &&
        token === followRunToken
      ) {
        keepFollowedRabbiCentred(
          true
        );
      }
    }

    if (
      !shown ||
      !followActive ||
      token !== followRunToken
    ) {
      return;
    }

    if (
      rabbiEvent
    ) {
      updateFollowStatus(
        `${followedRabbi.name} â€” ${nextYear}: ${rabbiEvent.event}`
      );

    } else {
      updateFollowStatus(
        `Following ${followedRabbi.name} â€” ${nextYear}`
      );
    }

    preloadFollowWindow(
      followedRabbi,
      currentIndex + 1,
      5
    ).catch(
      () => {}
    );

    const elapsed =
      performance.now() -
      stepStart;

    if (
      changedLocation
    ) {
      // The journey itself is already slow.
      // Only retain an additional pause where there
      // is an event attached to the arrival year.
      const arrivalPause =
        rabbiEvent
          ? Math.min(
              8000,
              Math.max(
                3000,
                normalSpeed *
                  2.5
              )
            )
          : 0;

      await delay(
        arrivalPause
      );

    } else {
      const targetDuration =
        rabbiEvent
          ? Math.min(
              10000,
              Math.max(
                4000,
                normalSpeed *
                  4
              )
            )
          : normalSpeed;

      await delay(
        Math.max(
          0,
          targetDuration -
          elapsed
        )
      );
    }
  }
}

function pauseFollowPlayback(
  message = "Paused"
) {
  if (
    !followActive ||
    followPaused
  ) {
    return;
  }

  followPaused =
    true;

  updateFollowStatus(
    `${message} â€” ${
      followedRabbi?.name ||
      ""
    } ${
      currentYear ||
      ""
    }`.trim()
  );
}

function stopFollowPlayback({
  keepSelection = false,
  message = "Follow stopped"
} = {}) {
  followRunToken++;

  followActive =
    false;

  followPaused =
    false;

  followLastPosition =
    null;

  MOVE_DURATION =
    320;

  // If Stop is clicked during a long-distance journey,
  // immediately stop the Leaflet map animation.
  if (
    map._isFollowTravel
  ) {
    map.stop();
  }

  map._isFollowTravel =
    false;

  const oldRabbi =
    followedRabbi;

  followedRabbi =
    keepSelection
      ? followedRabbi
      : null;

  if (
    !keepSelection
  ) {
    const select =
      document.getElementById(
        "storyRabbiSelect"
      );

    if (select) {
      select.value =
        "";
    }
  }

  if (
    oldRabbi?._marker
  ) {
    oldRabbi._marker.setZIndexOffset(
      0
    );
  }

  refreshRabbiMarkerSizes();

  updateFollowStatus(
    message
  );
}

main();

