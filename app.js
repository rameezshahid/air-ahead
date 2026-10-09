(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const STORE = "airahead.v1";

  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* private mode */ } };

  const params = new URLSearchParams(location.search);
  const saved = load();
  const prefs = {
    location: params.get("loc") || saved.location || "",
    profile: saved.profile || "general",
    threshold: +(params.get("t") || saved.threshold || 7),
  };

  let locations = [];
  let observations = new Map();
  let forecast = [];
  let outlook = [];
  let notifyTimer = null;
  let lastNotified = "";

  // ---- Static content ------------------------------------------------------

  $("scale").innerHTML = AA.CATEGORIES.map((c) =>
    `<tr><td><span class="badge" style="background:${c.color};color:#fff">${c.max === Infinity ? "10+" : `${c.min || 1}–${c.max}`}</span></td><td>${c.name}</td><td>${c.general}</td><td>${c.atRisk}</td></tr>`
  ).join("");
  $("legend").innerHTML = AA.CATEGORIES.map((c) => `<span><i style="background:${c.color}"></i>${c.name}</span>`).join("") +
    `<span><i style="background:var(--ink);height:2px;vertical-align:3px"></i>Your threshold</span>`;

  // ---- Controls -------------------------------------------------------------

  $("profile").value = prefs.profile in AA.PROFILES ? prefs.profile : "general";
  prefs.profile = $("profile").value;
  setThreshold(prefs.threshold);

  $("profile").addEventListener("change", () => {
    prefs.profile = $("profile").value;
    setThreshold(AA.PROFILES[prefs.profile].defaultThreshold);
    save(); render();
  });
  $("threshold").addEventListener("input", () => { setThreshold(+$("threshold").value); save(); render(); });
  $("location").addEventListener("change", () => selectLocation($("location").value));

  // ---- Map ------------------------------------------------------------------

  const map = AA.createMap($("map"), { onSelect: (id) => selectLocation(id) });
  if (!map) {
    $("map-summary").textContent = "The map couldn't load. Use the location list above instead.";
    $("map").classList.add("hidden");
  }
  $("map-legend").innerHTML = AA.CATEGORIES.map((c) => `<span><i style="background:${c.color};border-radius:50%"></i>${c.name}</span>`).join("") +
    `<span><i style="border:2px dashed var(--ink);border-radius:50%;background:none"></i>Selected area</span>`;

  // One entry point for every way of choosing an area: map, list, or "use my location".
  function selectLocation(id, { fly = true } = {}) {
    if (!locations.some((l) => l.id === id)) return;
    prefs.location = id;
    $("location").value = id;
    save();
    if (map) map.highlight(id, { fly });
    loadForecast();
  }

  function renderMapSummary() {
    const { counts, worst } = AA.summarize(locations, observations);
    const parts = AA.CATEGORIES.filter((c) => counts[c.id]).map((c) => `${counts[c.id]} ${c.name.toLowerCase()}`);
    $("map-summary").innerHTML = `${locations.length} monitoring areas: ${parts.join(", ")}.` +
      (worst ? ` Highest right now: <strong>${esc(worst.name)}</strong> (AQHI ${Math.round(worst.aqhi) > 10 ? "10+" : Math.round(worst.aqhi)}). Select any dot for details.` : "");
  }

  // Below 4 is "low risk", where official guidance is to carry on as usual, so alerting there isn't meaningful.
  function setThreshold(v) {
    v = Math.min(10, Math.max(4, Math.round(+v) || 7));
    prefs.threshold = v;
    $("threshold").value = v;
    $("threshold-value").textContent = v;
  }

  $("locate").addEventListener("click", () => {
    if (!navigator.geolocation) { $("locate-note").textContent = "Location isn't available in this browser."; return; }
    $("locate-note").textContent = "Finding your nearest monitoring area…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const n = AA.nearest(locations, pos.coords.latitude, pos.coords.longitude);
        if (!n) return;
        $("locate-note").textContent = `Nearest AQHI area: ${n.name} (about ${n.km} km away). Your location isn't stored or sent anywhere.`;
        selectLocation(n.id);
      },
      () => { $("locate-note").textContent = "Couldn't get your location. Pick from the list instead."; },
      { maximumAge: 600000, timeout: 10000 }
    );
  });

  // ---- Data ---------------------------------------------------------------

  async function getJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function loadLocations() {
    const data = await getJson(`${AA.API}/aqhi-observations-realtime/items?f=json&latest=true&limit=1000`);
    observations = new Map();
    const seen = new Map();
    for (const f of data.features) {
      const p = f.properties;
      observations.set(p.location_id, p);
      if (!seen.has(p.location_id)) {
        seen.set(p.location_id, { id: p.location_id, name: p.location_name_en, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
      }
    }
    locations = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    $("location").innerHTML = locations.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("");
    if (!seen.has(prefs.location)) {
      const toronto = locations.find((l) => /Toronto/.test(l.name));
      prefs.location = (toronto || locations[0]).id;
    }
    $("location").value = prefs.location;
    if (map) map.setLocations(locations, observations);
    renderMapSummary();
  }

  async function loadForecast() {
    try {
      $("error").classList.add("hidden");
      const data = await getJson(`${AA.API}/aqhi-forecasts-realtime/items?f=json&location_id=${encodeURIComponent(prefs.location)}&sortby=-publication_datetime&limit=150`);
      forecast = AA.latestForecast(data.features);
      outlook = AA.periodOutlook(data.features);
    } catch (e) {
      forecast = [];
      outlook = [];
      showError(`Couldn't load the forecast (${e.message}). Environment Canada's service may be busy, so try again in a minute.`);
    }
    render();
  }

  function showError(msg) { $("error").textContent = msg; $("error").classList.remove("hidden"); }

  // ---- Render --------------------------------------------------------------

  function render() {
    const loc = locations.find((l) => l.id === prefs.location);
    const obs = observations.get(prefs.location);
    const atRisk = prefs.profile === "atRisk";
    history.replaceState(null, "", `?loc=${encodeURIComponent(prefs.location)}&t=${prefs.threshold}`);

    if (obs) {
      const c = AA.category(obs.aqhi);
      $("dial").style.background = c.color;
      $("dial").textContent = Math.round(obs.aqhi) > 10 ? "10+" : Math.round(obs.aqhi);
      $("now-label").textContent = `Now in ${loc ? loc.name : ""}`;
      $("now-category").textContent = c.name;
      $("now-advice").textContent = atRisk ? c.atRisk : c.general;
      $("now-time").textContent = `Observed ${obs.observation_datetime_text_en.replace(/\s+/g, " ")}${obs.special_notes_en ? ` · ${obs.special_notes_en}` : ""}`;
    }

    const hours = AA.upcoming(forecast, new Date(), 48);
    const next24 = AA.upcoming(forecast, new Date(), 24);
    $("forecast-sub").textContent = hours.length
      ? `Hourly forecast in local time (${hours[0].label.tz}). Bars at or above ${prefs.threshold} cross your threshold.`
      : "No forecast available for this location right now.";

    const above = AA.firstAbove(next24, prefs.threshold);
    const best = AA.bestWindow(next24, prefs.threshold);
    const peak = next24.reduce((m, h) => (h.aqhi > (m ? m.aqhi : -1) ? h : m), null);
    const when = (h) => `${h.label.day} ${h.label.hour}`;
    $("plan").innerHTML = next24.length ? [
      above
        ? `<div class="callout bad"><strong>Heads-up:</strong> the forecast reaches AQHI ${Math.round(above.aqhi)} at <strong>${when(above)}</strong>, at or above your threshold of ${prefs.threshold}. ${esc(atRisk ? AA.category(above.aqhi).atRisk : AA.category(above.aqhi).general)}</div>`
        : `<div class="callout good"><strong>All clear for the next 24 hours.</strong> The forecast stays below your threshold of ${prefs.threshold}.</div>`,
      best
        ? `<div class="callout"><strong>Best window:</strong> ${when(best.start)} to ${when(best.end)} (${best.length} hour${best.length === 1 ? "" : "s"}, AQHI ${best.max} or lower).${peak ? ` Peak: AQHI ${Math.round(peak.aqhi)} at ${when(peak)}.` : ""}</div>`
        : `<div class="callout warn"><strong>No hours below your threshold</strong> in the next 24 hours. Plan indoor activities.</div>`,
    ].join("") : `<p class="muted">Forecast unavailable.</p>`;
    if (outlook.length) {
      $("plan").innerHTML += `<div style="grid-column:1/-1"><div class="k muted small" style="margin-bottom:6px">Outlook</div><div class="row">${outlook.map((p) => {
        const c = AA.category(p.aqhi);
        return `<span class="badge" style="background:${c.color};color:#fff">${esc(p.name)}: ${Math.round(p.aqhi)}${p.smoke != null ? ` (smoke: ${Math.round(p.smoke)})` : ""}</span>`;
      }).join("")}</div></div>`;
    }

    if (map) {
      map.updateInfo(next24.length
        ? `<div>Next 24 h: peak AQHI <strong>${Math.round(peak.aqhi)}</strong> at ${when(peak)}.</div>` +
          (above
            ? `<div style="color:var(--bad)">Reaches your threshold of ${prefs.threshold} at ${when(above)}.</div>`
            : `<div>Stays below your threshold of ${prefs.threshold}.</div>`) +
          `<div style="margin-top:4px"><a href="#now-card">Full forecast below ↓</a></div>`
        : `<div class="muted">No forecast for this area right now.</div>`);
    }

    drawChart(hours);
  }

  function drawChart(hours) {
    const svg = $("chart");
    const W = svg.clientWidth || 800, H = 220, padL = 24, padB = 34, padT = 10;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (!hours.length) { svg.innerHTML = ""; return; }
    const maxV = Math.max(10, ...hours.map((h) => Math.round(h.aqhi)));
    const plotH = H - padB - padT;
    const bw = (W - padL) / hours.length;
    const y = (v) => padT + plotH - (v / maxV) * plotH;
    let out = "";
    [0, 3, 6, 10].forEach((v) => {
      out += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" />`;
      out += `<text x="0" y="${y(v) + 3}">${v}</text>`;
    });
    hours.forEach((h, i) => {
      const v = Math.round(h.aqhi);
      const c = AA.category(h.aqhi);
      const x = padL + i * bw;
      out += `<rect x="${x + 1}" y="${y(v)}" width="${Math.max(1, bw - 2)}" height="${y(0) - y(v)}" rx="2" fill="${c.color}" opacity="${v >= prefs.threshold ? 1 : 0.55}"><title>${esc(h.text.replace(/\s+/g, " "))}: AQHI ${v} (${c.name})</title></rect>`;
      if (i % 6 === 0) out += `<text x="${x}" y="${H - 18}">${h.label.hour}</text>`;
      if (i === 0 || h.label.hour === "12 AM") out += `<text x="${x}" y="${H - 5}" font-weight="700">${h.label.day}</text>`;
    });
    out += `<line x1="${padL}" x2="${W}" y1="${y(prefs.threshold)}" y2="${y(prefs.threshold)}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="6 4" />`;
    svg.innerHTML = out;
  }
  window.addEventListener("resize", () => drawChart(AA.upcoming(forecast, new Date(), 48)));

  // ---- Notifications (while the tab is open) ---------------------------------

  $("notify").addEventListener("click", async () => {
    if (!("Notification" in window)) { showError("This browser doesn't support notifications."); return; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { showError("Notifications are blocked for this site."); return; }
    $("notify").textContent = "🔔 Watching. You'll be notified while this tab stays open";
    $("notify").disabled = true;
    const check = async () => {
      await loadForecast();
      const above = AA.firstAbove(AA.upcoming(forecast, new Date(), 12), prefs.threshold);
      const key = above ? `${prefs.location}-${above.time.toISOString()}` : "";
      if (above && key !== lastNotified) {
        lastNotified = key;
        new Notification("AirAhead: air quality alert", { body: `AQHI ${Math.round(above.aqhi)} forecast at ${above.label.day} ${above.label.hour}, at or above your threshold of ${prefs.threshold}.` });
      }
    };
    check();
    clearInterval(notifyTimer);
    notifyTimer = setInterval(check, 30 * 60 * 1000);
  });

  // ---- Start --------------------------------------------------------------

  loadLocations()
    // On first load, mark the saved area but keep the overview: no zoom, no popup covering the map.
    .then(() => { if (map) map.highlight(prefs.location, { fly: false, popup: false }); return loadForecast(); })
    .catch((e) => showError(`Couldn't reach Environment Canada's air quality service (${e.message}). Try again shortly.`));
})();
