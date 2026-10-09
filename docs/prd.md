# PRD: AirAhead MVP

**Status:** MVP shipped · **Owner:** [@rameezshahid](https://github.com/rameezshahid) · **Last updated:** October 2026

## Goal

Turn the official AQHI forecast into **a decision about when to be outside**, personalized to the user's sensitivity, within 10 seconds of opening the app.

## Non-goals (MVP)

- Replacing official alerts or medical advice
- Notifications when the app is closed (needs a backend; see roadmap)
- Indoor air quality, pollen, UV
- Quebec, which uses Info-Smog rather than the AQHI

## User stories

| # | As a… | I want to… | So that… |
|---|---|---|---|
| U1 | parent of a child with asthma | set a lower threshold than the general public | warnings match our needs |
| U2 | runner | see the best clean-air window today | I can plan my run |
| U3 | any user | see when the forecast first crosses my threshold | I can plan ahead |
| U4 | caregiver | share an exact setup with family | everyone uses the same threshold |
| U5 | new user | find my nearest monitoring area automatically | I don't have to know station names |

## Requirements

| Priority | Requirement | Status |
|---|---|---|
| Must | Live current AQHI and hourly forecast from ECCC | ✅ |
| Must | General vs at-risk profile, with official guidance for each | ✅ |
| Must | Adjustable threshold (4–10) | ✅ |
| Must | First crossing, best window and peak for the next 24 hours | ✅ |
| Must | Clear errors when the data service is unavailable | ✅ |
| Should | 48-hour chart in the location's local time | ✅ |
| Should | Map of all areas coloured by current risk; selecting one highlights it and shows its info | ✅ v1.1 |
| Should | Nearest area from browser location, not stored | ✅ |
| Should | Shareable URL | ✅ |
| Could | Notifications while the tab is open | ✅ |
| Could | Notifications when closed | Roadmap |

## Success metrics

| Type | Metric | Target |
|---|---|---|
| North star | Users who say AirAhead changed *when* they went outside, during a smoke event | ≥ 40% of diary-study participants |
| Time to value | Open → see a "plan your day" answer | Under 10 seconds |
| Comprehension | Users who correctly explain the best window | ≥ 85% |
| Retention (later) | Return visits during smoke season | Weekly active ÷ monthly active ≥ 30% |
| Reliability | Successful forecast loads | ≥ 99% (API dependent) |

## Key decisions and trade-offs

| Decision | Alternatives | Why | Cost |
|---|---|---|---|
| **Compete on planning, not alerts** | Build another alert app | WeatherCAN already does notifications well; planning is underserved | Smaller feature set at first |
| **Browser calls ECCC's API directly** | Our own backend or cache | No infrastructure, nothing to maintain, data always fresh; the API allows cross-origin calls | Depends on API uptime; no closed-app alerts |
| **Paraphrase official guidance, link the source** | Write our own health advice | Health messaging must stay faithful to the authority | Less room for tone |
| **Threshold floor of 4** | Allow 1–10 | Below 4 is "low risk" (official guidance: carry on as usual); alerts there contradict the guidance | Can't set ultra-low alerts |
| **At-risk default 4, general default 7** | One default | Mirrors where official guidance first changes for each group | Users must pick a profile |
| **Exclude Quebec, say so** | Mix in a different index | Info-Smog isn't comparable to the AQHI; mixing them would mislead | Quebec users aren't served |
| **Map: points with a highlight ring, not region shapes** | Draw region boundaries | ECCC publishes AQHI per community (an average of local stations), not per region. Drawing boundaries would imply precision the data doesn't have | Less "filled-in" look than a choropleth |
| **Map, list and location share one selection path** | Separate handlers | Whichever way a user picks an area, the map, cards, chart and URL stay in sync | Slightly more coupling in the UI code |
| **OpenStreetMap tiles** | Commercial basemaps | Free with attribution for light use and no API key. A keyed provider (CARTO) started showing "API key required" during development | Must stay within OSM's tile usage policy; revisit if traffic grows |

## Risks

| Risk | Mitigation |
|---|---|
| Forecasts are uncertain, especially in fast-moving smoke | Show the observed value and its time; link to official alerts |
| API changes its format (it already mixes hourly and period records) | Tests built on real response shapes; explicit filtering |
| Users rely on it as medical advice | Clear disclaimer; official guidance only |
| Notifications stop when the tab closes | Labelled clearly in the button text |
| Map tiles fail to load (third-party dependency) | The location list stays fully usable; if the map library fails, the map hides and says so |

## Roadmap

| Next | Item | Why |
|---|---|---|
| 1 | Research plan, timed for smoke season | Validate A1 and A2 |
| 2 | Closed-app alerts via web push and a small scheduled job | Biggest expected request (A4) |
| 3 | Several saved places (home, school, work) | Common for parents and commuters |
| 4 | French version | Official languages, wider reach |
| 5 | Team view for outdoor employers | Possible B2B angle (A5) |
| 6 | Show official air-quality alerts in-app | Context for the forecast |
