// Map of AQHI communities (Leaflet). AQHI is published per community, an
// average of local stations, so each area is shown as a point; the selected
// one gets a highlight ring rather than a boundary we don't have.
(function (AA) {
  "use strict";

  const HIGHLIGHT_RADIUS_M = 25000;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Marker style for a reading; pure, so it can be tested.
  AA.markerStyle = function (aqhi, selected) {
    const c = aqhi == null ? { color: "#8a94a3" } : AA.category(aqhi);
    return selected
      ? { radius: 11, weight: 3, color: "#16202b", fillColor: c.color, fillOpacity: 1 }
      : { radius: 7, weight: 1.5, color: "#ffffff", fillColor: c.color, fillOpacity: 0.9 };
  };

  // Counts per category plus the worst reading right now.
  AA.summarize = function (locations, observations) {
    const counts = Object.fromEntries(AA.CATEGORIES.map((c) => [c.id, 0]));
    let worst = null;
    for (const l of locations) {
      const o = observations.get(l.id);
      if (!o || o.aqhi == null) continue;
      counts[AA.category(o.aqhi).id]++;
      if (!worst || o.aqhi > worst.aqhi) worst = { name: l.name, aqhi: o.aqhi };
    }
    return { counts, worst };
  };

  AA.createMap = function (el, { onSelect }) {
    if (!window.L) return null;
    const dark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
    const map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.5, worldCopyJump: false, minZoom: 3 });
    // OpenStreetMap's standard tiles: free with attribution for light use. Dark mode inverts them with CSS.
    if (dark) el.classList.add("dark-tiles");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · AQHI: ECCC',
    }).addTo(map);
    map.fitBounds([[42, -135], [62, -55]]);

    // Scroll-zoom only after the user engages with the map, so the page still scrolls.
    map.on("click focus", () => map.scrollWheelZoom.enable());
    map.on("mouseout blur", () => map.scrollWheelZoom.disable());

    const markers = new Map();
    let ring = null;
    let selectedId = null;
    let data = { locations: [], observations: new Map() };

    function setLocations(locations, observations) {
      data = { locations, observations };
      markers.forEach((m) => m.remove());
      markers.clear();
      for (const l of locations) {
        const o = observations.get(l.id);
        const m = L.circleMarker([l.lat, l.lon], AA.markerStyle(o ? o.aqhi : null, false))
          .bindTooltip(`${esc(l.name)}${o ? ` · AQHI ${Math.round(o.aqhi)}` : ""}`, { direction: "top", offset: [0, -6] })
          .on("click", () => onSelect(l.id))
          .addTo(map);
        markers.set(l.id, m);
      }
      const pts = locations.map((l) => [l.lat, l.lon]);
      if (pts.length) map.fitBounds(pts, { padding: [24, 24], maxZoom: 6 });
    }

    function popupHtml(id, extra) {
      const l = data.locations.find((x) => x.id === id);
      const o = data.observations.get(id);
      if (!l) return "";
      const c = o ? AA.category(o.aqhi) : null;
      return `<div class="map-pop">
        <div class="pop-title">${esc(l.name)}</div>
        ${c ? `<div><span class="badge" style="background:${c.color};color:#fff">AQHI ${Math.round(o.aqhi) > 10 ? "10+" : Math.round(o.aqhi)} · ${c.name}</span></div>
        <div class="small muted">Observed ${esc(o.observation_datetime_text_en.replace(/\s+/g, " "))}</div>` : `<div class="small muted">No current reading</div>`}
        ${extra ? `<div class="small" style="margin-top:6px">${extra}</div>` : ""}
      </div>`;
    }

    // Highlight an area: bigger outlined marker, a ring around it, popup with info.
    function highlight(id, { fly = true, popup = true, extra = "" } = {}) {
      const l = data.locations.find((x) => x.id === id);
      if (!l) return;
      if (selectedId && markers.has(selectedId)) {
        const prev = data.observations.get(selectedId);
        markers.get(selectedId).setStyle(AA.markerStyle(prev ? prev.aqhi : null, false));
      }
      selectedId = id;
      const o = data.observations.get(id);
      const m = markers.get(id);
      m.setStyle(AA.markerStyle(o ? o.aqhi : null, true)).bringToFront();
      if (ring) ring.remove();
      const color = o ? AA.category(o.aqhi).color : "#8a94a3";
      ring = L.circle([l.lat, l.lon], { radius: HIGHLIGHT_RADIUS_M, color, weight: 2, dashArray: "6 5", fillColor: color, fillOpacity: 0.12, interactive: false }).addTo(map);
      m.bindPopup(popupHtml(id, extra), { autoPan: true, closeButton: true, offset: [0, -4] });
      // Open the popup after the fly animation ends: its auto-pan would otherwise cancel the zoom.
      if (fly) {
        map.once("moveend", () => { if (popup && selectedId === id) m.openPopup(); });
        map.flyTo([l.lat, l.lon], Math.max(map.getZoom(), 7), { duration: 0.8 });
      } else if (popup) {
        m.openPopup();
      }
    }

    function updateInfo(extra) {
      if (!selectedId || !markers.has(selectedId)) return;
      const m = markers.get(selectedId);
      m.setPopupContent(popupHtml(selectedId, extra));
    }

    function invalidate() { map.invalidateSize(); }

    return { setLocations, highlight, updateInfo, invalidate };
  };
})(window.AA = window.AA || {});
