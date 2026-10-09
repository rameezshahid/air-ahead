// AQHI helpers. Categories and guidance follow Environment and Climate Change
// Canada's "About the Air Quality Health Index" page (checked October 2026),
// paraphrased.
(function (AA) {
  "use strict";

  AA.API = "https://api.weather.gc.ca/collections";

  AA.CATEGORIES = [
    { id: "low", name: "Low risk", min: 0, max: 3, color: "#3a7bd5",
      general: "Enjoy your usual outdoor activities.",
      atRisk: "Enjoy your usual outdoor activities." },
    { id: "moderate", name: "Moderate risk", min: 4, max: 6, color: "#e0a100",
      general: "Carry on as usual unless you notice symptoms like coughing or throat irritation.",
      atRisk: "If you have symptoms like coughing or throat irritation, consider reducing or rescheduling strenuous outdoor activity." },
    { id: "high", name: "High risk", min: 7, max: 10, color: "#d6402b",
      general: "If you have symptoms like coughing or throat irritation, consider reducing or rescheduling strenuous outdoor activity.",
      atRisk: "Reduce or reschedule strenuous outdoor activity." },
    { id: "very-high", name: "Very high risk", min: 11, max: Infinity, color: "#7a1f1f",
      general: "Reduce or reschedule strenuous outdoor activity, especially if you have symptoms.",
      atRisk: "Avoid strenuous activity outdoors." },
  ];

  AA.PROFILES = {
    general: { label: "General population", defaultThreshold: 7 },
    atRisk: { label: "At higher risk (children, people over 65, people with heart or lung conditions)", defaultThreshold: 4 },
  };

  // AQHI is reported to one decimal in observations; the category uses the rounded value.
  AA.category = function (aqhi) {
    const v = Math.round(aqhi);
    return AA.CATEGORIES.find((c) => v >= c.min && v <= c.max) || AA.CATEGORIES[0];
  };

  AA.distanceKm = function (lat1, lon1, lat2, lon2) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // locations: [{ id, name, lat, lon }]
  AA.nearest = function (locations, lat, lon) {
    let best = null, bestD = Infinity;
    for (const l of locations) {
      const d = AA.distanceKm(lat, lon, l.lat, l.lon);
      if (d < bestD) { bestD = d; best = l; }
    }
    return best ? { ...best, km: Math.round(bestD) } : null;
  };

  // From API features, keep only the latest publication; an amended forecast
  // replaces the original for the same hour.
  // The API mixes hourly records ("AQHI-Forecast") with period summaries
  // ("AQHI-Forecast-Period": Tonight, Tomorrow…) that have no forecast_datetime.
  AA.latestForecast = function (features) {
    const props = features.map((f) => f.properties).filter((p) => p.aqhi_type !== "AQHI-Forecast-Period" && p.forecast_datetime);
    if (!props.length) return [];
    const latestPub = props.map((p) => p.publication_datetime).sort().pop();
    const byHour = new Map();
    for (const p of props.filter((x) => x.publication_datetime === latestPub)) {
      const prev = byHour.get(p.forecast_datetime);
      if (!prev || p.forecast_type === "amended") byHour.set(p.forecast_datetime, p);
    }
    return [...byHour.values()]
      .sort((a, b) => a.forecast_datetime.localeCompare(b.forecast_datetime))
      .map((p) => ({ time: new Date(p.forecast_datetime), aqhi: p.aqhi, label: AA.localLabel(p.forecast_datetime_text_en), text: p.forecast_datetime_text_en }));
  };

  // Multi-day outlook from the latest period summary: [{ name: "Tonight", aqhi }]
  AA.periodOutlook = function (features) {
    const periods = features.map((f) => f.properties).filter((p) => p.aqhi_type === "AQHI-Forecast-Period" && p.forecast_period);
    if (!periods.length) return [];
    const latest = periods.sort((a, b) => b.publication_datetime.localeCompare(a.publication_datetime))[0];
    return Object.keys(latest.forecast_period).sort().map((k) => {
      const p = latest.forecast_period[k];
      return { name: p.forecast_period_en, aqhi: p.aqhi, smoke: p.aqhi_insmoke ?? null };
    }).filter((p) => p.aqhi != null);
  };

  // "6:00 AM ADT Wednesday  7 October 2026" -> { hour: "6 AM", day: "Wed", tz: "ADT" }
  AA.localLabel = function (text) {
    const m = /^(\d{1,2}):\d{2}\s*(AM|PM)\s+(\S+)\s+(\w+)/.exec(text || "");
    if (!m) return { hour: "", day: "", tz: "" };
    return { hour: `${m[1]} ${m[2]}`, day: m[4].slice(0, 3), tz: m[3] };
  };

  // Hours from `now` onward, within `hours`.
  AA.upcoming = function (forecast, now, hours = 48) {
    const end = now.getTime() + hours * 3600000;
    return forecast.filter((f) => f.time.getTime() >= now.getTime() - 3600000 && f.time.getTime() <= end);
  };

  // First hour at or above the user's threshold.
  AA.firstAbove = function (hours, threshold) {
    return hours.find((h) => Math.round(h.aqhi) >= threshold) || null;
  };

  // Longest run of consecutive hours below the threshold.
  AA.bestWindow = function (hours, threshold) {
    let best = null, start = -1;
    for (let i = 0; i <= hours.length; i++) {
      const ok = i < hours.length && Math.round(hours[i].aqhi) < threshold;
      if (ok && start < 0) start = i;
      if (!ok && start >= 0) {
        const len = i - start;
        if (!best || len > best.length) best = { start: hours[start], end: hours[i - 1], length: len, max: Math.max(...hours.slice(start, i).map((h) => Math.round(h.aqhi))) };
        start = -1;
      }
    }
    return best;
  };
})(window.AA = window.AA || {});
