'use strict';
let data = null;
const taskCache = new Map();
const tips = [];
const expSort = {key: 'created_at', dir: -1};
const taskSort = {key: 'task_id', dir: 1};
const FLOOR = 0.1, STALE_MIN = 75;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const isNum = x => typeof x === 'number' && isFinite(x);
const bits = x => !isNum(x) ? '—' : x >= 1000 ? Math.round(x).toLocaleString('en-US') : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
const pct = x => !isNum(x) ? '—' : (100 * x).toFixed(x === 1 || x === 0 ? 0 : 1) + '%';
const dec = (x, d = 1) => !isNum(x) ? '—' : x.toFixed(d);
const compact = x => !isNum(x) ? '—' : x >= 1e9 ? (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'k' : String(Math.round(x));
const color = student => `var(--s${(data.student_slots?.[student] ?? 7) % 8})`;
const date = t => isNum(t) ? new Date(t * 1000).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false}) : '';
const age = s => !isNum(s) ? '—' : s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h';

function tip(html) { tips.push(html); return tips.length - 1; }
function showTip(ev) {
  const el = ev.target.closest('[data-tip]');
  const box = $('tooltip');
  if (!el) { box.style.display = 'none'; return; }
  box.innerHTML = tips[+el.dataset.tip] || '';
  box.style.display = 'block';
  const w = box.offsetWidth, h = box.offsetHeight;
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + w > innerWidth - 8) x = ev.clientX - w - 14;
  if (y + h > innerHeight - 8) y = ev.clientY - h - 14;
  box.style.left = Math.max(8, x) + 'px'; box.style.top = Math.max(8, y) + 'px';
}
document.addEventListener('pointermove', showTip);
document.addEventListener('pointerdown', showTip);

function freshness() {
  if (!data) return;
  const m = (Date.now() / 1000 - data.generated_at) / 60;
  $('freshness').textContent = m > STALE_MIN ? `stale snapshot · ${Math.floor(m)} min old` : `snapshot age ${Math.max(0, Math.floor(m))} min`;
  $('freshness').className = m > STALE_MIN ? 'stale-text' : '';
}

function render() {
  tips.length = 0;
  $('updated').textContent = 'Snapshot: ' + data.generated_label;
  $('updated').className = '';
  $('digest').textContent = 'Content digest ' + String(data.content_digest).slice(0, 12) + '.';
  freshness();
  renderFleet();
  fillSelects();
  renderProgress();
  renderExperiments();
  renderTaskSelect();
  renderStudyB();
}

/* ------------------------------------------------------------------ fleet */
function renderFleet() {
  const f = data.fleet, t = f.totals, q = f.queue;
  const tile = (label, value, sw, extra = '') => `<article class="panel tile"><span class="label">${sw ? `<i class="swatch ${sw}"></i>` : ''}${label}</span><strong>${value}<small>${extra}</small></strong></article>`;
  $('fleet-tiles').innerHTML = tile('Busy', t.busy, 'c-busy', `/ ${f.expected_gpus}`) + tile('Warm', t.warm, 'c-warm', `/ ${f.expected_gpus}`) + tile('Idle', t.idle, 'c-idle', `/ ${f.expected_gpus}`) + tile('Stale', t.stale, 'c-stale', `/ ${f.expected_gpus}`) + tile('Unreported', t.unreported, '', `/ ${f.expected_gpus}`);
  $('queue').innerHTML = ['pending', 'running', 'done', 'failed'].map(k => `<span class="pill">queue ${k} ${q[k]}</span>`).join('');
  $('nodes').innerHTML = f.nodes.map(n => {
    const cells = n.cells.map((c, i) => `<i class="cell c-${c}" data-tip="${tip(`<b>${esc(n.label)}</b> · GPU ${i}<br>${c}`)}"></i>`).join('');
    const tasks = n.tasks.length ? `<br><span class="tip-muted">tasks:</span> ${n.tasks.map(esc).join(', ')}` : '';
    return `<article class="panel node" data-tip="${tip(`<b>${esc(n.label)}</b> (${esc(n.kind.toUpperCase())})<br>busy ${n.busy} · warm ${n.warm} · idle ${n.idle} · stale ${n.stale}<br>heartbeat age at snapshot: ${age(n.age_s)}${tasks}`)}"><div class="node-title"><b>${esc(n.label)}</b><span class="muted">${esc(n.kind.toUpperCase())}</span></div><div class="cells" role="img" aria-label="${esc(n.label)}: ${n.busy} busy, ${n.warm} warm, ${n.idle} idle, ${n.stale} stale">${cells}</div><div class="node-meta ${n.heartbeat_stale ? 'stale' : ''}">busy ${n.busy} · warm ${n.warm} · heartbeat ${age(n.age_s)}${n.heartbeat_stale ? ' · STALE' : ''}</div></article>`;
  }).join('') || '<p class="muted">No lane worker heartbeats found.</p>';
  $('fleet-note').textContent = `Heartbeats older than ${f.stale_after_s} s at snapshot time count as stale; unreported = expected ${f.expected_gpus} GPUs minus GPUs listed by any heartbeat. Warm GPUs run a matmul burner and are released to the next queued task within seconds.`;
}

/* --------------------------------------------------------------- selects */
function fillSelects() {
  const keep = id => $(id).value;
  const set = (id, values) => { const old = keep(id); $(id).innerHTML = '<option value="all">all</option>' + values.map(v => `<option>${esc(v)}</option>`).join(''); if ([...$(id).options].some(o => o.value === old)) $(id).value = old; };
  set('f-student', [...new Set(data.experiments.map(e => e.student))].sort());
  set('f-protocol', [...new Set(data.experiments.map(e => e.protocol))].sort());
  set('progress-student', data.progress.students.map(s => s.student));
  const counts = {};
  data.experiments.forEach(e => counts[e.status] = (counts[e.status] || 0) + 1);
  $('exp-counts').innerHTML = `<span class="pill">${data.experiments.length} experiments</span>` + Object.entries(counts).map(([k, v]) => `<span class="pill">${esc(k)} ${v}</span>`).join('');
}

/* -------------------------------------------------------------- progress */
function renderProgress() {
  const P = data.progress, chart = $('progress-chart');
  const sel = $('progress-student').value;
  const students = P.students.filter(s => sel === 'all' || s.student === sel);
  $('progress-png').hidden = !data.has_progress_png;
  $('progress-note').textContent = P.skipped ? `${P.skipped} progress entries were skipped (missing experiment or student).` : '';
  if (!P.present || P.error || !P.versions.length) {
    chart.innerHTML = `<div class="empty">${P.error ? `<span class="error">${esc(P.error)}</span>` : !P.present ? 'No protocol versions registered yet.<br>The figure appears once <code>runs/progress.json</code> lists protocol versions and their experiments.' : 'runs/progress.json lists no protocol versions yet.'}</div>`;
    $('progress-legend').innerHTML = '';
    $('progress-table').innerHTML = progressRows(students);
    return;
  }
  const versions = P.versions;
  const series = students.map(s => ({s, pts: s.points.filter(p => isNum(p.mean_bits)).map(p => ({p, i: versions.indexOf(p.version)})).sort((a, b) => a.i - b.i)}));
  const lines = [];
  students.forEach(s => ['reference', 'free'].forEach(kind => { const b = s.baselines[kind]; if (b && isNum(b.value)) lines.push({s, kind, b}); }));
  const values = [...series.flatMap(x => x.pts.map(q => q.p.mean_bits)), ...lines.map(l => l.b.value)].map(v => Math.max(v, FLOOR));
  if (!values.length) {
    chart.innerHTML = '<div class="empty">Registered experiments have no finished shards yet.</div>';
    $('progress-legend').innerHTML = legend(students);
    $('progress-table').innerHTML = progressRows(students);
    return;
  }
  let lo = 10 ** Math.floor(Math.log10(Math.min(...values))), hi = 10 ** Math.ceil(Math.log10(Math.max(...values)));
  if (hi <= lo) hi = lo * 10;
  const W = Math.max(460, Math.round(chart.clientWidth - 36)), H = 360, L = 58, R = 128, T = 14, B = 46;
  const x = i => versions.length === 1 ? L + (W - L - R) / 2 : L + 28 + i * (W - L - R - 56) / (versions.length - 1);
  const y = v => T + (Math.log10(hi) - Math.log10(Math.max(v, FLOOR))) / (Math.log10(hi) - Math.log10(lo)) * (H - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mean certified bits per task by protocol version, log scale"><g font-size="11" fill="var(--muted)" font-family="system-ui">`;
  const decades = Math.round(Math.log10(hi / lo));
  for (let d = lo; d <= hi * 1.0001; d *= 10) {
    if (decades <= 3 && d < hi) for (const m of [2, 5]) svg += `<line x1="${L}" x2="${W - R}" y1="${y(d * m)}" y2="${y(d * m)}" stroke="var(--grid)" stroke-width="0.6"/>`;
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(d)}" y2="${y(d)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(d) + 4}" text-anchor="end">${d >= 1 ? d.toLocaleString('en-US') : d}</text>`;
  }
  versions.forEach((v, i) => svg += `<text x="${x(i)}" y="${H - B + 18}" text-anchor="middle" fill="var(--ink)">${esc(v)}</text>`);
  svg += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">protocol version</text><text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">certified bits per task</text></g>`;
  const labels = [];
  for (const l of lines) {
    const yy = y(l.b.value), dash = l.kind === 'reference' ? '7 4' : '2 3';
    const what = l.kind === 'reference' ? 'reference: force the reference solution' : l.b.lower_bound ? 'free: −log₂ (mean α), a lower bound (some tasks never succeeded alone)' : 'free: mean over tasks of −log₂ α';
    const extra = l.kind === 'free' ? `<br>α (success alone) ${pct(l.b.alpha)} · tasks with α = 0: ${l.b.zero_success_tasks ?? '—'}` : `<br>success ${pct(l.b.success_rate)}`;
    const t = tip(`<b>${esc(l.s.student)}</b> · ${what}<br>${bits(l.b.value)} bits${extra}<br><span class="tip-muted">${esc(l.b.experiment)} · ${esc(l.b.status)} · ${l.b.tasks ?? '—'} tasks · ${esc(l.b.source)}</span>`);
    svg += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${color(l.s.student)}" stroke-width="1.6" stroke-dasharray="${dash}"/><line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="transparent" stroke-width="12" data-tip="${t}"/>`;
    labels.push({y: yy, text: `${l.kind === 'free' ? '−log₂α' : 'reference'}${l.b.lower_bound ? ' ≥' : ''}`, student: l.s.student});
  }
  for (const {s, pts} of series) {
    if (pts.length > 1) svg += `<polyline points="${pts.map(q => x(q.i) + ',' + y(q.p.mean_bits)).join(' ')}" fill="none" stroke="${color(s.student)}" stroke-width="2"/>`;
    for (const q of pts) {
      const p = q.p;
      const t = tip(`<b>${esc(s.student)}</b> · ${esc(p.version)}${p.label ? ' · ' + esc(p.label) : ''}<br>${bits(p.mean_bits)} bits / task (median ${bits(p.median_bits)})<br>success ${pct(p.success_rate)} · fallback ${pct(p.fallback_rate)} · forced ${bits(p.mean_forced_bits)} bits<br><span class="tip-muted">${esc(p.protocol)} · ${esc(p.experiment)} · ${esc(p.status)} · ${p.tasks ?? '—'} tasks${p.mean_bits < FLOOR ? ' · plotted at the 0.1-bit floor' : ''}</span>${p.note ? '<br>' + esc(p.note) : ''}`);
      svg += `<circle cx="${x(q.i)}" cy="${y(p.mean_bits)}" r="5" fill="${color(s.student)}" stroke="var(--panel)" stroke-width="2"/><circle cx="${x(q.i)}" cy="${y(p.mean_bits)}" r="12" fill="transparent" data-tip="${t}"/>`;
    }
    if (pts.length) { const last = pts[pts.length - 1]; labels.push({y: y(last.p.mean_bits), text: s.student, student: s.student, series: true}); }
  }
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 13);
  svg += labels.map(l => `<g><rect x="${W - R + 8}" y="${l.y - 4}" width="8" height="8" rx="2" fill="${color(l.student)}"/><text x="${W - R + 20}" y="${l.y + 4}" font-size="11" fill="${l.series ? 'var(--ink)' : 'var(--muted)'}" font-family="system-ui">${esc(l.text)}</text></g>`).join('');
  chart.innerHTML = svg + '</svg>';
  $('progress-legend').innerHTML = legend(students);
  $('progress-table').innerHTML = progressRows(students);
}
function legend(students) {
  return students.map(s => { const f = s.baselines.free; return `<span><i class="swatch" style="background:${color(s.student)}"></i>${esc(s.student)}${f && isNum(f.alpha) ? ` <span class="muted">(free α ${pct(f.alpha)})</span>` : ''}</span>`; }).join('') + '<span><i class="key-line ref"></i>reference baseline</span><span><i class="key-line free"></i>free −log₂ α</span>';
}
function progressRows(students) {
  const rows = [];
  for (const s of students) {
    for (const p of s.points) rows.push(`<tr><td><i class="swatch" style="background:${color(s.student)}"></i> ${esc(s.student)}</td><td>${esc(p.version)}</td><td>${esc(p.label)}${p.note ? `<small>${esc(p.note)}</small>` : ''}</td><td>${esc(p.protocol)}</td><td><a class="exp" href="#tasks" data-exp="${esc(p.experiment)}">${esc(p.experiment)}</a></td><td class="num">${bits(p.mean_bits)}</td><td class="num">${pct(p.success_rate)}</td><td class="num">${pct(p.fallback_rate)}</td><td class="num">${p.tasks ?? '—'}</td><td class="state ${esc(p.status)}">${esc(p.status)}</td></tr>`);
    for (const kind of ['reference', 'free']) {
      const b = s.baselines[kind];
      if (!b) continue;
      const value = kind === 'free' ? `${bits(b.value)}${b.lower_bound ? ' ≥' : ''}` : bits(b.value);
      rows.push(`<tr><td><i class="swatch" style="background:${color(s.student)}"></i> ${esc(s.student)}</td><td class="muted">baseline</td><td>${kind === 'free' ? 'free: −log₂ α' : 'reference: force the reference'}<small>${esc(b.source)}</small></td><td>${kind}</td><td><a class="exp" href="#tasks" data-exp="${esc(b.experiment)}">${esc(b.experiment)}</a></td><td class="num">${value}</td><td class="num">${pct(kind === 'free' ? b.alpha : b.success_rate)}</td><td class="num">—</td><td class="num">${b.tasks ?? '—'}</td><td class="state ${esc(b.status)}">${esc(b.status)}</td></tr>`);
    }
  }
  return rows.join('') || '<tr><td colspan="10" class="muted">No progress entries.</td></tr>';
}

/* ----------------------------------------------------------- experiments */
function cmp(a, b, key, dir) {
  const x = a[key], y = b[key];
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', {numeric: true})) * dir;
}
function markSort(table, sort) {
  table.querySelectorAll('th.sortable').forEach(th => th.setAttribute('aria-sort', th.dataset.key === sort.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'));
}
function renderExperiments() {
  const st = $('f-student').value, pr = $('f-protocol').value, ss = $('f-status').value, q = $('f-search').value.toLowerCase();
  const rows = data.experiments.filter(e => (st === 'all' || e.student === st) && (pr === 'all' || e.protocol === pr) && (ss === 'all' || e.status === ss) && [e.name, e.suite, e.config_summary, e.student, e.protocol].join(' ').toLowerCase().includes(q)).sort((a, b) => cmp(a, b, expSort.key, expSort.dir));
  markSort($('exp-table'), expSort);
  $('exp-rows').innerHTML = rows.map(e => {
    const shards = `${e.shards_done}/${e.shards} shards${e.shards_running ? ' · ' + e.shards_running + ' running' : ''}${e.shards_failed ? ' · ' + e.shards_failed + ' failed' : ''}${e.shards_queued ? ' · ' + e.shards_queued + ' queued' : ''}`;
    const ends = Object.entries(e.ends || {}).map(([k, v]) => `${k} ${v}`).join(' · ');
    const extra = e.protocol === 'free' ? `<small>−log₂α ${e.neg_log2_alpha != null ? bits(e.neg_log2_alpha) : e.neg_log2_mean_alpha != null ? '≥ ' + bits(e.neg_log2_mean_alpha) : '—'}</small>` : '';
    return `<tr><td><a class="exp" href="#tasks" data-exp="${esc(e.name)}">${esc(e.name)}</a><small>${esc(date(e.created_at))}${e.snapshot ? ' · src ' + esc(e.snapshot) : ''}</small></td><td><i class="swatch" style="background:${color(e.student)}"></i> ${esc(e.student)}</td><td>${esc(e.suite)}${e.limit ? `<small>limit ${e.limit}</small>` : ''}</td><td>${esc(e.protocol)}</td><td><code>${esc(e.config_summary)}</code></td><td><span class="state ${esc(e.status)}">${esc(e.status)}</span><small>${shards}</small></td><td class="num">${e.tasks}</td><td class="num">${e.runs ?? '—'}</td><td class="num" data-tip="${tip(ends ? 'ends: ' + esc(ends) + `<br>fallback ${pct(e.fallback_rate)} · restarts / run ${dec(e.mean_restarts, 2)}` : 'no records yet')}">${pct(e.success_rate)}${extra}</td><td class="num">${bits(e.mean_bits)}</td><td class="num">${bits(e.median_bits)}</td><td class="num">${bits(e.mean_forced_bits)}</td><td class="num">${dec(e.mean_select_blocks, 2)}</td><td class="num">${dec(e.mean_tokens, 0)}</td><td class="num" data-tip="${tip(`generated ${compact(e.tokens_generated)} · scored ${compact(e.tokens_scored)} tokens`)}">${compact(e.tokens_generated)}</td><td class="num" data-tip="${tip(`run ${dec(e.gpu_hours, 3)} GPU-h · model load ${dec(e.load_hours, 3)} GPU-h`)}">${dec(e.gpu_hours, 2)}</td></tr>`;
  }).join('') || '<tr><td colspan="16" class="muted">No experiments match.</td></tr>';
}

/* --------------------------------------------------------------- per task */
function renderTaskSelect() {
  const sel = $('task-exp'), old = sel.value;
  sel.innerHTML = data.experiments.map(e => `<option value="${esc(e.name)}">${esc(e.name)} (${esc(e.protocol)}, ${esc(e.student)})</option>`).join('');
  if (data.experiments.some(e => e.name === old)) sel.value = old;
  else { const first = data.experiments.find(e => e.tasks > 0 && e.protocol !== 'free') || data.experiments.find(e => e.tasks > 0); if (first) sel.value = first.name; }
  loadTasks();
}
async function loadTasks() {
  const name = $('task-exp').value;
  const e = data.experiments.find(x => x.name === name);
  if (!e) { $('task-head').innerHTML = ''; $('task-rows').innerHTML = '<tr><td class="muted">No experiments yet.</td></tr>'; $('task-summary').textContent = ''; return; }
  $('task-summary').textContent = `${e.tasks} tasks · mean ${bits(e.mean_bits)} bits · median ${bits(e.median_bits)} · success ${pct(e.success_rate)} · ${e.status}`;
  const key = name + ':' + data.content_digest;
  if (!taskCache.has(key)) {
    try { const r = await fetch(`experiments/${encodeURIComponent(name)}.json?d=${String(data.content_digest).slice(0, 12)}`); if (!r.ok) throw Error(r.status); taskCache.set(key, (await r.json()).tasks); }
    catch (err) { $('task-rows').innerHTML = `<tr><td class="error">Could not load per-task data (${esc(err.message)}).</td></tr>`; return; }
  }
  renderTasks(e, taskCache.get(key));
}
function renderTasks(e, rows) {
  const free = e.protocol === 'free';
  const cols = [['task_id', 'Task', 0], ['runs', 'Runs', 1], ['success_rate', 'Success', 1], ['mean_bits', 'Mean bits', 1], ['mean_forced_bits', 'Forced bits', 1], ['mean_select_blocks', 'SELECT', 1], ['mean_free_blocks', 'FREE', 1], ['mean_tokens', 'Tokens', 1], ['mean_restarts', 'Restarts', 1], ['fallback_rate', 'Fallback', 1]];
  if (free) cols.push(['neg_log2_alpha', '−log₂ α', 1]);
  cols.push(['ends', 'End', 0]);
  $('task-head').innerHTML = cols.map(([k, label, n]) => k === 'ends' ? `<th>${label}</th>` : `<th class="sortable${n ? ' num' : ''}" data-key="${k}" tabindex="0">${label}</th>`).join('');
  markSort($('task-table'), taskSort);
  const q = $('task-search').value.toLowerCase();
  const max = Math.max(1e-9, ...rows.map(r => r.mean_bits || 0));
  const shown = rows.filter(r => r.task_id.toLowerCase().includes(q)).sort((a, b) => cmp(a, b, taskSort.key, taskSort.dir));
  $('task-rows').innerHTML = shown.map(r => `<tr><td>${esc(r.task_id)}</td><td class="num">${r.runs}</td><td class="num">${pct(r.success_rate)}</td><td class="num"><div class="bar"><span>${bits(r.mean_bits)}</span><span class="bar-track"><i style="width:${(100 * (r.mean_bits || 0) / max).toFixed(1)}%"></i></span></div></td><td class="num">${bits(r.mean_forced_bits)}</td><td class="num">${dec(r.mean_select_blocks, 2)}</td><td class="num">${dec(r.mean_free_blocks, 1)}</td><td class="num">${dec(r.mean_tokens, 0)}</td><td class="num">${dec(r.mean_restarts, 2)}</td><td class="num">${pct(r.fallback_rate)}</td>${free ? `<td class="num">${bits(r.neg_log2_alpha)}</td>` : ''}<td>${esc(Object.entries(r.ends).map(([k, v]) => `${k} ${v}`).join(' · '))}</td></tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">${rows.length ? 'No task matches.' : 'No finished shards yet.'}</td></tr>`;
  $('task-table')._rows = rows; $('task-table')._exp = e;
}

/* ---------------------------------------------------------------- study B */
function renderStudyB() {
  const b = data.study_b, box = $('radar');
  if (b.status === 'pending') { box.innerHTML = '<div class="panel pending"><b>Pending.</b> Study B starts after Study A fixes the best protocol. Each checkpoint will get a radar of bits-based predictions against post-SFT accuracy per task axis (from <code>runs/studyB/radar.json</code>).</div>'; return; }
  if (b.status !== 'ready') { box.innerHTML = `<div class="panel pending"><span class="error">radar.json is invalid: ${esc(b.error)}</span></div>`; return; }
  const [lo, hi] = b.range, n = b.axes.length, SW = 380, SH = 300, C = SW / 2, CY = SH / 2 + 4, Rr = 105;
  const pt = (i, v) => { const a = -Math.PI / 2 + 2 * Math.PI * i / n, r = Rr * Math.min(1, Math.max(0, (v - lo) / (hi - lo))); return [C + r * Math.cos(a), CY + r * Math.sin(a)]; };
  const cards = b.checkpoints.map(c => {
    let svg = `<svg viewBox="0 0 ${SW} ${SH}" role="img" aria-label="Radar for ${esc(c.name)}"><g font-size="11" fill="var(--muted)" font-family="system-ui">`;
    for (const f of [0.25, 0.5, 0.75, 1]) svg += `<polygon points="${b.axes.map((_, i) => pt(i, lo + f * (hi - lo)).join(',')).join(' ')}" fill="none" stroke="var(--line)"/>`;
    b.axes.forEach((a, i) => { const [x, y] = pt(i, hi), [lx, ly] = [C + (x - C) * 1.12, CY + (y - CY) * 1.12]; svg += `<line x1="${C}" y1="${CY}" x2="${x}" y2="${y}" stroke="var(--line)"/><text x="${lx}" y="${ly + 3}" text-anchor="${Math.abs(lx - C) < 8 ? 'middle' : lx > C ? 'start' : 'end'}" fill="var(--ink)">${esc(a)}</text>`; });
    svg += `<text x="${C + 4}" y="${CY - Rr + 11}" font-size="9">${hi}</text></g>`;
    b.series.forEach((label, k) => {
      const v = c.values[label];
      if (!v) return;
      const pts = v.map((x, i) => isNum(x) ? pt(i, x) : null);
      const col = `var(--s${k % 8})`;
      svg += `<polygon points="${pts.filter(Boolean).map(p => p.join(',')).join(' ')}" fill="${col}" fill-opacity="0.12" stroke="${col}" stroke-width="2"/>`;
      pts.forEach((p, i) => { if (p) svg += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${col}" stroke="var(--panel)" stroke-width="2"/><circle cx="${p[0]}" cy="${p[1]}" r="10" fill="transparent" data-tip="${tip(`<b>${esc(c.name)}</b> · ${esc(b.axes[i])}<br>${esc(label)}: ${v[i]}`)}"/>`; });
    });
    return `<article class="panel radar"><h3>${esc(c.name)}</h3>${svg}</svg></article>`;
  }).join('');
  box.innerHTML = `<div class="radar-grid">${cards}</div><div class="legend" style="margin-top:10px">${b.series.map((l, k) => `<span><i class="swatch" style="background:var(--s${k % 8})"></i>${esc(l)}</span>`).join('')}</div>${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}`;
}

/* ------------------------------------------------------------------ wiring */
function sortable(table, sort, rerender) {
  const handler = ev => {
    const th = ev.target.closest('th.sortable');
    if (!th || (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ')) return;
    if (ev.type === 'keydown') ev.preventDefault();
    const k = th.dataset.key;
    sort.dir = sort.key === k ? -sort.dir : (k === 'name' || k === 'task_id' || k === 'student' || k === 'suite' || k === 'protocol' || k === 'status' ? 1 : -1);
    sort.key = k;
    rerender();
  };
  table.addEventListener('click', handler);
  table.addEventListener('keydown', handler);
}
sortable($('exp-table'), expSort, () => data && renderExperiments());
sortable($('task-table'), taskSort, () => $('task-table')._rows && renderTasks($('task-table')._exp, $('task-table')._rows));
for (const id of ['f-student', 'f-protocol', 'f-status', 'f-search']) $(id).addEventListener('input', () => data && renderExperiments());
$('progress-student').addEventListener('change', () => data && renderProgress());
let resizeTimer = 0, lastWidth = 0;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { const w = $('progress-chart').clientWidth; if (data && w !== lastWidth) { lastWidth = w; renderProgress(); } }, 150); });
$('task-exp').addEventListener('change', loadTasks);
$('task-search').addEventListener('input', () => $('task-table')._rows && renderTasks($('task-table')._exp, $('task-table')._rows));
document.addEventListener('click', ev => {
  const a = ev.target.closest('a[data-exp]');
  if (!a || !data) return;
  if (data.experiments.some(e => e.name === a.dataset.exp)) { $('task-exp').value = a.dataset.exp; loadTasks(); }
});

async function load() {
  try {
    const r = await fetch('data.json?t=' + Date.now(), {cache: 'no-store'});
    if (!r.ok) throw Error(r.status);
    data = await r.json();
    render();
  } catch (err) {
    $('updated').textContent = 'Could not read the latest snapshot; try again shortly.';
    $('updated').className = 'error';
    console.error(err);
  }
}
$('refresh').onclick = load;
try { const t = localStorage.getItem('ii-theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
$('theme').onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const t = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('ii-theme', t); } catch {}
};
load();
setInterval(load, 600000);
setInterval(freshness, 30000);
