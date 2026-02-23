// static/app.js

// ── State ──────────────────────────────────────────────────────
let outboundFlights = [];
let returnFlights = [];
let currentMode = 'specific';

// ── Date helpers ───────────────────────────────────────────────
function getFridaysInRange(start, end) {
  const fridays = [];
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() === 5) fridays.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return fridays;
}

function getFridaysNextNWeeks(n) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + n * 7);
  return getFridaysInRange(today, end);
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function getReturnDates(friday) {
  const dates = [];
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  const monday = new Date(friday);
  monday.setDate(friday.getDate() + 3);
  if (document.getElementById('ret-sunday').checked) dates.push(formatDate(sunday));
  if (document.getElementById('ret-monday').checked) dates.push(formatDate(monday));
  return dates;
}

// ── Mode tab switching ─────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentMode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.mode-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`mode-${currentMode}`).classList.remove('hidden');
  });
});

// ── Build search requests from current mode ────────────────────
function buildSearchRequests() {
  if (currentMode === 'specific') {
    const outDate = document.getElementById('specific-outbound').value;
    if (!outDate) throw new Error('Please pick an outbound Friday.');
    const friday = new Date(outDate);
    const returnDates = getReturnDates(friday);
    if (!returnDates.length) throw new Error('Select at least one return day.');
    return [{ outbound_date: outDate, return_dates: returnDates }];
  }

  if (currentMode === 'weekends') {
    const start = new Date(document.getElementById('weekends-start').value);
    const end = new Date(document.getElementById('weekends-end').value);
    if (!start || !end || start > end) throw new Error('Pick a valid date range.');
    const fridays = getFridaysInRange(start, end);
    if (!fridays.length) throw new Error('No Fridays found in that range.');
    return fridays.map(f => ({
      outbound_date: formatDate(f),
      return_dates: getReturnDates(f),
    }));
  }

  if (currentMode === 'window') {
    const n = parseInt(document.getElementById('window-weeks').value, 10);
    const fridays = getFridaysNextNWeeks(n);
    if (!fridays.length) throw new Error('No Fridays found.');
    return fridays.map(f => ({
      outbound_date: formatDate(f),
      return_dates: getReturnDates(f),
    }));
  }
}

// ── Search ─────────────────────────────────────────────────────
async function search() {
  const btn = document.getElementById('search-btn');
  const errEl = document.getElementById('search-error');
  errEl.classList.add('hidden');

  let requests;
  try { requests = buildSearchRequests(); }
  catch (e) { errEl.textContent = e.message; errEl.classList.remove('hidden'); return; }

  btn.disabled = true;
  btn.textContent = `Searching ${requests.length} weekend${requests.length > 1 ? 's' : ''}…`;

  try {
    let done = 0;
    const results = await Promise.all(
      requests.map(r =>
        fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(r),
        }).then(res => { done++; btn.textContent = `Searching… ${done}/${requests.length}`; return res.json(); })
      )
    );

    outboundFlights = results.flatMap(r => r.outbound || []);
    returnFlights = results.flatMap(r => r.returns || []);

    initFilters();
    renderAll();
    document.getElementById('results-section').classList.remove('hidden');
  } catch (e) {
    errEl.textContent = 'Search failed: ' + e.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Search Flights';
  }
}

document.getElementById('search-btn').addEventListener('click', search);

// ── Time window classification ─────────────────────────────────
function getTimeWindow(isoString) {
  const hour = new Date(isoString).getHours();
  if (hour >= 0 && hour < 9) return 'early';
  if (hour >= 16) return 'evening';
  return 'other';
}

function timeLabel(w) {
  return w === 'early' ? '🌙 Early' : w === 'evening' ? '🌆 Evening' : '';
}

// ── Filter application ─────────────────────────────────────────
function applyFilters(flights, col) {
  const maxPrice = parseFloat(document.getElementById(`${col}-price-slider`).value);
  const sort = document.getElementById(`${col}-sort`).value;
  const depEarly = document.getElementById('dep-early').checked;
  const depAfternoon = document.getElementById('dep-afternoon').checked;
  const retSunday = document.getElementById('ret-sunday').checked;
  const retMonday = document.getElementById('ret-monday').checked;

  let filtered = flights.filter(f => {
    if (f.price > maxPrice) return false;

    const dep = new Date(f.departure_at);
    const hour = dep.getHours();
    const dow = dep.getDay(); // 0=Sun, 1=Mon

    if (col === 'out') {
      // Only allow selected time windows; reject mid-day (9h–15h) always
      const w = getTimeWindow(f.departure_at);
      if (w === 'other') return false;
      if (w === 'early' && !depEarly) return false;
      if (w === 'evening' && !depAfternoon) return false;
    }

    if (col === 'ret') {
      if (dow === 0) {           // Sunday → only evening (18h+)
        if (!retSunday) return false;
        if (hour < 18) return false;
      } else if (dow === 1) {    // Monday → only very early (00h–05h)
        if (!retMonday) return false;
        if (hour >= 6) return false;
      }
    }

    return true;
  });

  filtered.sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    if (sort === 'time-asc') return new Date(a.departure_at) - new Date(b.departure_at);
    return 0;
  });

  return filtered;
}

// ── Duration formatting ────────────────────────────────────────
function formatDuration(iso) {
  return iso.replace('PT', '').replace('H', 'h ').replace('M', 'm');
}

// ── Card render ────────────────────────────────────────────────
function renderCards(flights, containerId) {
  const el = document.getElementById(containerId);
  if (!flights.length) { el.innerHTML = '<p class="no-results">No flights match your filters.</p>'; return; }
  el.innerHTML = flights.map(f => {
    const dep = new Date(f.departure_at);
    const arr = new Date(f.arrival_at);
    const w = getTimeWindow(f.departure_at);
    const fmt = t => t.toTimeString().slice(0, 5);
    return `<div class="flight-card ${w}">
      <div>
        <div class="times">${fmt(dep)} → ${fmt(arr)}</div>
        <div class="route">${f.origin} → ${f.destination}</div>
        <div class="info">${f.carrier}${f.flight_number} · ${formatDuration(f.duration)} ${timeLabel(w)}</div>
      </div>
      <div class="price">€${f.price.toFixed(0)}</div>
    </div>`;
  }).join('');
}

// ── Table render ───────────────────────────────────────────────
function renderTable(flights, containerId) {
  const el = document.getElementById(containerId);
  if (!flights.length) { el.innerHTML = '<p class="no-results">No flights match your filters.</p>'; return; }
  const rows = flights.map(f => {
    const dep = new Date(f.departure_at);
    const arr = new Date(f.arrival_at);
    const w = getTimeWindow(f.departure_at);
    const fmt = t => t.toTimeString().slice(0, 5);
    const dateStr = dep.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<tr class="${w}-row">
      <td>${dateStr}</td>
      <td>${fmt(dep)}</td>
      <td>${fmt(arr)}</td>
      <td>${f.origin}→${f.destination}</td>
      <td>${f.carrier}${f.flight_number}</td>
      <td>${formatDuration(f.duration)}</td>
      <td class="price-cell">€${f.price.toFixed(0)}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `<table class="flight-table">
    <thead><tr><th>Date</th><th>Dep</th><th>Arr</th><th>Route</th><th>Flight</th><th>Duration</th><th>Price</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── Render dispatcher ──────────────────────────────────────────
let outView = 'cards';
let retView = 'cards';

function renderCol(flights, col, view, resultsId, bestId) {
  const best = flights.reduce((min, f) => f.price < (min?.price ?? Infinity) ? f : min, null);
  const bestEl = document.getElementById(bestId);
  if (best) {
    bestEl.textContent = `Best: €${best.price.toFixed(0)} · ${best.carrier}${best.flight_number} · ${new Date(best.departure_at).toTimeString().slice(0, 5)} (${best.origin}→${best.destination})`;
    bestEl.classList.remove('hidden');
  } else {
    bestEl.classList.add('hidden');
  }
  if (view === 'cards') renderCards(flights, resultsId);
  else renderTable(flights, resultsId);
}

function renderAll() {
  const outFiltered = applyFilters(outboundFlights, 'out');
  const retFiltered = applyFilters(returnFlights, 'ret');
  renderCol(outFiltered, 'out', outView, 'out-results', 'out-best');
  renderCol(retFiltered, 'ret', retView, 'ret-results', 'ret-best');
}

// ── Init sliders from actual data ──────────────────────────────
function initFilters() {
  const outMax = Math.ceil(Math.max(...outboundFlights.map(f => f.price), 100));
  const retMax = Math.ceil(Math.max(...returnFlights.map(f => f.price), 100));
  const outSlider = document.getElementById('out-price-slider');
  const retSlider = document.getElementById('ret-price-slider');
  outSlider.max = outMax; outSlider.value = outMax;
  retSlider.max = retMax; retSlider.value = retMax;
  document.getElementById('out-price-val').textContent = `€${outMax}`;
  document.getElementById('ret-price-val').textContent = `€${retMax}`;
}

// ── Event listeners ────────────────────────────────────────────
document.getElementById('out-price-slider').addEventListener('input', e => {
  document.getElementById('out-price-val').textContent = `€${e.target.value}`;
  renderAll();
});
document.getElementById('ret-price-slider').addEventListener('input', e => {
  document.getElementById('ret-price-val').textContent = `€${e.target.value}`;
  renderAll();
});
document.getElementById('out-sort').addEventListener('change', renderAll);
document.getElementById('ret-sort').addEventListener('change', renderAll);
document.getElementById('dep-early').addEventListener('change', renderAll);
document.getElementById('dep-afternoon').addEventListener('change', renderAll);

// ── View toggle ────────────────────────────────────────────────
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const col = btn.dataset.col;
    const view = btn.dataset.view;
    btn.closest('.view-toggle').querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (col === 'out') outView = view;
    else retView = view;
    renderAll();
  });
});
