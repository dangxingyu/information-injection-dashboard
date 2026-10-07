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
  renderHeadlines();
  renderFindings();
  renderLhTotals();
  renderLongHorizon();
  renderStudyBSummary();
  renderStudyB();
  renderFinalEval();
}

/* ------------------------------------------------------------------ fleet */
const tile = (label, value, sw, extra = '') => `<article class="panel tile"><span class="label">${sw ? `<i class="swatch ${sw}"></i>` : ''}${label}</span><strong>${value}<small>${extra}</small></strong></article>`;
function renderHoldings() {
  const h = data.fleet.holdings, box = $('holdings');
  if (!box) return;
  if (!h) { box.innerHTML = '<span class="muted">Slurm holdings unavailable in this snapshot.</span>'; return; }
  const t = h.totals || {};
  box.innerHTML = tile('H100 working', t.h100_working || 0, 'c-busy', 'GPUs') + tile('H100 standby', t.h100_standby || 0, 'c-warm', 'GPUs') + tile('H200 working', t.h200_working || 0, 'c-busy', 'GPUs');
}
function renderFleet() {
  renderHoldings();
  const f = data.fleet, t = f.totals, q = f.queue;
  $('fleet-tiles').innerHTML = tile('Busy', t.busy, 'c-busy', `/ ${f.expected_gpus}`) + tile('Warm', t.warm, 'c-warm', `/ ${f.expected_gpus}`) + tile('Idle', t.idle, 'c-idle', `/ ${f.expected_gpus}`) + tile('Stale', t.stale, 'c-stale', `/ ${f.expected_gpus}`) + tile('Unreported', t.unreported, '', `/ ${f.expected_gpus}`);
  $('queue').innerHTML = ['pending', 'running', 'done', 'failed'].map(k => `<span class="pill">queue ${k} ${q[k]}</span>`).join('');
  $('nodes').innerHTML = f.nodes.map(n => {
    const cells = n.cells.map((c, i) => `<i class="cell c-${c}" data-tip="${tip(`<b>${esc(n.label)}</b> · GPU ${i}<br>${c}`)}"></i>`).join('');
    const tasks = n.tasks.length ? `<br><span class="tip-muted">tasks:</span> ${n.tasks.map(esc).join(', ')}` : '';
    return `<article class="panel node" data-tip="${tip(`<b>${esc(n.label)}</b> (${esc(n.kind.toUpperCase())})<br>busy ${n.busy} · warm ${n.warm} · idle ${n.idle} · stale ${n.stale}<br>heartbeat age at snapshot: ${age(n.age_s)}${tasks}`)}"><div class="node-title"><b>${esc(n.label)}</b><span class="muted">${esc(n.kind.toUpperCase())}</span></div><div class="cells" role="img" aria-label="${esc(n.label)}: ${n.busy} busy, ${n.warm} warm, ${n.idle} idle, ${n.stale} stale">${cells}</div><div class="node-meta ${n.heartbeat_stale ? 'stale' : ''}">busy ${n.busy} · warm ${n.warm} · heartbeat ${age(n.age_s)}${n.heartbeat_stale ? ' · STALE' : ''}</div></article>`;
  }).join('') || '<p class="muted">No lane worker heartbeats found.</p>';
  $('fleet-note').textContent = `Heartbeats older than ${f.stale_after_s} s at snapshot time count as stale; expected = GPUs we hold now (the PLI slot plus running ailab H200 jobs); unreported = expected minus GPUs listed by any lane heartbeat (a held GPU with no lane worker). Warm GPUs run a matmul burner and are released to the next queued task within seconds.`;
}

/* --------------------------------------------------------------- selects */
function fillSelects() {
  const keep = id => $(id).value;
  const set = (id, values) => { const old = keep(id); $(id).innerHTML = '<option value="all">all</option>' + values.map(v => `<option>${esc(v)}</option>`).join(''); if ([...$(id).options].some(o => o.value === old)) $(id).value = old; };
  set('f-student', [...new Set(data.experiments.map(e => e.student))].sort());
  set('f-protocol', [...new Set(data.experiments.map(e => e.protocol))].sort());
  const suiteSel = $('progress-suite'), oldSuite = suiteSel.value;
  suiteSel.innerHTML = data.progress.suites.map(x => `<option>${esc(x.suite)}</option>`).join('');
  if (data.progress.suites.some(x => x.suite === oldSuite)) suiteSel.value = oldSuite;
  fillProgressStudents();
  const counts = {};
  data.experiments.forEach(e => counts[e.status] = (counts[e.status] || 0) + 1);
  $('exp-counts').innerHTML = `<span class="pill">${data.experiments.length} experiments</span>` + Object.entries(counts).map(([k, v]) => `<span class="pill">${esc(k)} ${v}</span>`).join('');
}

/* -------------------------------------------------------------- progress */
function currentSuite() {
  const P = data.progress;
  return P.suites.find(x => x.suite === $('progress-suite').value) || P.suites[0];
}
function fillProgressStudents() {
  const S = currentSuite(), sel = $('progress-student'), old = sel.value;
  sel.innerHTML = '<option value="all">all</option>' + (S ? S.students : []).map(x => `<option>${esc(x.student)}</option>`).join('');
  if ([...sel.options].some(o => o.value === old)) sel.value = old;
}
function idealTip(student, b) {
  return `<b>${esc(student)}</b> · ideal: mean −log₂ α over solvable tasks<br>${bits(b.value)} bits · ${b.solvable_tasks} of ${b.tasks} tasks solvable · mean α ${pct(b.alpha)}<br>all-task lower bound (95% Clopper-Pearson for unsolved tasks): ${bits(b.ideal_lower_bound_bits)} bits<br><span class="tip-muted">${b.runs.toLocaleString('en-US')} free-sampling runs pooled from ${b.experiments.map(esc).join(', ')} · ${esc(b.status)} · ${esc(b.source)}</span>`;
}
function refTip(student, b) {
  return `<b>${esc(student)}</b> · reference: force the reference solution<br>${bits(b.value)} bits / task · success ${pct(b.success_rate)} · ${b.tasks ?? '—'} tasks<br><span class="tip-muted">${esc(b.experiment)} · ${esc(b.status)} · ${esc(b.source)}</span>`;
}
function pointTip(student, p, v) {
  return `<b>${esc(student)}</b> · ${esc(p.version)} (${esc(p.protocol)})<br>${bits(p.mean_bits)} bits / task (median ${bits(p.median_bits)})<br>success ${pct(p.success_rate)} · fallback ${pct(p.fallback_rate)} · forced ${bits(p.mean_forced_bits)} bits<br><span class="tip-muted">${esc(p.experiment)} · ${esc(p.status)} · ${p.tasks ?? '—'} tasks${isNum(p.mean_bits) && p.mean_bits < FLOOR ? ' · plotted at the 0.1-bit floor' : ''}</span>${v && v.label ? '<br>' + esc(v.label) : ''}`;
}
function renderProgress() {
  const P = data.progress, chart = $('progress-chart'), S = currentSuite();
  const sel = $('progress-student').value;
  $('progress-png').hidden = !(S && S.figure);
  if (S && S.figure) $('progress-png').href = S.figure + '?d=' + String(data.content_digest).slice(0, 12);
  $('progress-note').textContent = P.skipped ? `${P.skipped} progress entries were skipped (no experiment, student or suite).` : '';
  if (!P.present || P.error || !S || !S.versions.length) {
    chart.innerHTML = `<div class="empty"><div>${P.error ? `<span class="error">${esc(P.error)}</span>` : !P.present ? 'No protocol versions registered yet.<br>The figure appears once <code>runs/progress.json</code> lists protocol versions and their experiments.' : 'runs/progress.json lists no protocol versions for this suite yet.'}</div></div>`;
    $('progress-legend').innerHTML = '';
    $('progress-head').innerHTML = '';
    $('progress-table').innerHTML = '';
    return;
  }
  const versions = S.versions.map(v => v.version), vinfo = Object.fromEntries(S.versions.map(v => [v.version, v]));
  const students = S.students.filter(x => sel === 'all' || x.student === sel);
  const series = students.map(st => ({st, pts: st.points.filter(p => isNum(p.mean_bits)).map(p => ({p, i: versions.indexOf(p.version)})).sort((a, b) => a.i - b.i)}));
  const lines = [];
  students.forEach(st => ['reference', 'ideal'].forEach(kind => { const b = st.baselines[kind]; if (b && isNum(b.value)) lines.push({st, kind, b}); }));
  const values = [...series.flatMap(x => x.pts.map(q => q.p.mean_bits)), ...lines.map(l => l.b.value)].map(v => Math.max(v, FLOOR));
  renderMatrix(S, students);
  $('progress-legend').innerHTML = students.map(st => `<span><i class="swatch" style="background:${color(st.student)}"></i>${esc(st.student)}</span>`).join('') + '<span><i class="key-line ref"></i>reference (force the reference)</span><span><i class="key-line free"></i>ideal: mean −log₂ α over solvable tasks</span>';
  if (!values.length) { chart.innerHTML = '<div class="empty"><div>Registered experiments have no finished shards yet.</div></div>'; return; }
  let lo = 10 ** Math.floor(Math.log10(Math.min(...values))), hi = 10 ** Math.ceil(Math.log10(Math.max(...values)));
  if (hi <= lo) hi = lo * 10;
  const W = Math.max(460, Math.round(chart.clientWidth - 36)), H = 360, L = 58, R = 128, T = 14, B = 46;
  const x = i => versions.length === 1 ? L + (W - L - R) / 2 : L + 28 + i * (W - L - R - 56) / (versions.length - 1);
  const y = v => T + (Math.log10(hi) - Math.log10(Math.max(v, FLOOR))) / (Math.log10(hi) - Math.log10(lo)) * (H - T - B);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(S.suite)}: mean certified bits per task by protocol version, log scale"><g font-size="11" fill="var(--muted)" font-family="system-ui">`;
  const decades = Math.round(Math.log10(hi / lo));
  for (let d = lo; d <= hi * 1.0001; d *= 10) {
    if (decades <= 3 && d < hi) for (const m of [2, 5]) svg += `<line x1="${L}" x2="${W - R}" y1="${y(d * m)}" y2="${y(d * m)}" stroke="var(--grid)" stroke-width="0.6"/>`;
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(d)}" y2="${y(d)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(d) + 4}" text-anchor="end">${d >= 1 ? d.toLocaleString('en-US') : d}</text>`;
  }
  versions.forEach((v, i) => svg += `<text x="${x(i)}" y="${H - B + 18}" text-anchor="middle" fill="var(--ink)" data-tip="${tip(`<b>${esc(v)}</b> · ${esc(vinfo[v].protocol)}<br>${esc(vinfo[v].label)}${vinfo[v].note ? '<br><span class="tip-muted">' + esc(vinfo[v].note) + '</span>' : ''}`)}">${esc(v)}</text>`);
  svg += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">protocol version (${esc(S.suite)})</text><text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">certified bits per task</text></g>`;
  const labels = [];
  for (const l of lines) {
    const yy = y(l.b.value), dash = l.kind === 'reference' ? '7 4' : '2 3';
    const t = tip(l.kind === 'reference' ? refTip(l.st.student, l.b) : idealTip(l.st.student, l.b));
    svg += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${color(l.st.student)}" stroke-width="1.6" stroke-dasharray="${dash}"/><line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="transparent" stroke-width="12" data-tip="${t}"/>`;
    if (students.length <= 2) labels.push({y: yy, text: l.kind, student: l.st.student});
  }
  for (const {st, pts} of series) {
    if (pts.length > 1) svg += `<polyline points="${pts.map(q => x(q.i) + ',' + y(q.p.mean_bits)).join(' ')}" fill="none" stroke="${color(st.student)}" stroke-width="2"/>`;
    for (const q of pts) {
      const t = tip(pointTip(st.student, q.p, vinfo[q.p.version]));
      const open = q.p.status !== 'complete';
      svg += `<circle cx="${x(q.i)}" cy="${y(q.p.mean_bits)}" r="5" fill="${open ? 'var(--panel)' : color(st.student)}" stroke="${open ? color(st.student) : 'var(--panel)'}" stroke-width="2"/><circle cx="${x(q.i)}" cy="${y(q.p.mean_bits)}" r="12" fill="transparent" data-tip="${t}"/>`;
    }
    if (pts.length) { const last = pts[pts.length - 1]; labels.push({y: y(last.p.mean_bits), text: st.student, student: st.student, series: true}); }
  }
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 13);
  svg += labels.map(l => `<g><rect x="${W - R + 8}" y="${l.y - 4}" width="8" height="8" rx="2" fill="${color(l.student)}"/><text x="${W - R + 20}" y="${l.y + 4}" font-size="11" fill="${l.series ? 'var(--ink)' : 'var(--muted)'}" font-family="system-ui">${esc(l.text)}</text></g>`).join('');
  chart.innerHTML = svg + '</svg>';
}
function renderMatrix(S, students) {
  $('progress-head').innerHTML = '<th>Version</th><th>Protocol</th><th>Description</th>' + students.map(st => `<th class="num"><i class="swatch" style="background:${color(st.student)}"></i> ${esc(st.student)}</th>`).join('');
  const cell = (st, html, small, t) => `<td class="num"${t !== undefined ? ` data-tip="${t}"` : ''}>${html}${small ? `<small>${small}</small>` : ''}</td>`;
  const link = name => `<a class="exp" href="#tasks" data-exp="${esc(name)}">${esc(name)}</a>`;
  const rows = [];
  rows.push('<tr><td class="muted">ref</td><td>reference</td><td>force the reference solution (teacher-answer likelihood)</td>' + students.map(st => { const b = st.baselines.reference; return !b ? cell(st, '—') : cell(st, bits(b.value), `${b.experiment ? link(b.experiment) : ''} · ${esc(b.status)}`, tip(b.value != null ? refTip(st.student, b) : 'missing')); }).join('') + '</tr>');
  rows.push('<tr><td class="muted">ideal</td><td>free</td><td>mean −log₂ α over solvable tasks (student alone)</td>' + students.map(st => { const b = st.baselines.ideal; return !b || b.value == null ? cell(st, '—', b ? esc(b.status) : '') : cell(st, bits(b.value), `${b.solvable_tasks}/${b.tasks} solvable · α ${pct(b.alpha)}`, tip(idealTip(st.student, b))); }).join('') + '</tr>');
  for (const v of S.versions) {
    rows.push(`<tr><td><b>${esc(v.version)}</b></td><td>${esc(v.protocol)}</td><td>${esc(v.label)}${v.note ? `<small>${esc(v.note)}</small>` : ''}</td>` + students.map(st => {
      const p = [...st.points].reverse().find(q => q.version === v.version);
      if (!p) return cell(st, '<span class="muted">·</span>');
      return cell(st, isNum(p.mean_bits) ? bits(p.mean_bits) : '—', `<span class="state ${esc(p.status)}">${esc(p.status)}</span>${isNum(p.success_rate) ? ' · ' + pct(p.success_rate) : ''}${p.tasks ? ' · ' + p.tasks + ' tasks' : ''}`, tip(pointTip(st.student, p, v)));
    }).join('') + '</tr>');
  }
  $('progress-table').innerHTML = rows.join('');
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
  const smoke = $('f-smoke').checked;
  const rows = data.experiments.filter(e => (smoke || !e.name.startsWith('smoke')) && (st === 'all' || e.student === st) && (pr === 'all' || e.protocol === pr) && (ss === 'all' || e.status === ss) && [e.name, e.suite, e.config_summary, e.student, e.protocol].join(' ').toLowerCase().includes(q)).sort((a, b) => cmp(a, b, expSort.key, expSort.dir));
  markSort($('exp-table'), expSort);
  $('exp-rows').innerHTML = rows.map(e => {
    const shards = `${e.shards_done}/${e.shards} shards${e.shards_running ? ' · ' + e.shards_running + ' running' : ''}${e.shards_failed ? ' · ' + e.shards_failed + ' failed' : ''}${e.shards_queued ? ' · ' + e.shards_queued + ' queued' : ''}`;
    const ends = Object.entries(e.ends || {}).map(([k, v]) => `${k} ${v}`).join(' · ');
    const extra = e.protocol === 'free' && e.tasks ? `<small>ideal ${bits(e.ideal_bits)} · ${e.solvable_tasks}/${e.tasks} solvable</small>` : '';
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
  if (free) cols.push(['ideal_bits', '−log₂ α', 1]);
  cols.push(['ends', 'End', 0]);
  $('task-head').innerHTML = cols.map(([k, label, n]) => k === 'ends' ? `<th>${label}</th>` : `<th class="sortable${n ? ' num' : ''}" data-key="${k}" tabindex="0">${label}</th>`).join('');
  markSort($('task-table'), taskSort);
  const q = $('task-search').value.toLowerCase();
  const max = Math.max(1e-9, ...rows.map(r => r.mean_bits || 0));
  const shown = rows.filter(r => r.task_id.toLowerCase().includes(q)).sort((a, b) => cmp(a, b, taskSort.key, taskSort.dir));
  $('task-rows').innerHTML = shown.map(r => `<tr><td>${esc(r.task_id)}</td><td class="num">${r.runs}</td><td class="num">${pct(r.success_rate)}</td><td class="num"><div class="bar"><span>${bits(r.mean_bits)}</span><span class="bar-track"><i style="width:${(100 * (r.mean_bits || 0) / max).toFixed(1)}%"></i></span></div></td><td class="num">${bits(r.mean_forced_bits)}</td><td class="num">${dec(r.mean_select_blocks, 2)}</td><td class="num">${dec(r.mean_free_blocks, 1)}</td><td class="num">${dec(r.mean_tokens, 0)}</td><td class="num">${dec(r.mean_restarts, 2)}</td><td class="num">${pct(r.fallback_rate)}</td>${free ? `<td class="num">${r.ideal_bound ? '≥ ' : ''}${bits(r.ideal_bits)}</td>` : ''}<td>${esc(Object.entries(r.ends).map(([k, v]) => `${k} ${v}`).join(' · '))}</td></tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">${rows.length ? 'No task matches.' : 'No finished shards yet.'}</td></tr>`;
  $('task-table')._rows = rows; $('task-table')._exp = e;
}

/* -------------------------------------------------------------- headlines */
function hlBars(rows, refLabel) {
  const max = Math.max(...rows.map(r => r.bits || 0), 1);
  return rows.map(r => `<div class="hl-row${r.label === refLabel ? ' ref' : ''}"><span>${esc(r.label)}</span><span class="track"><i style="width:${(100 * (r.bits || 0) / max).toFixed(1)}%"></i></span><b>${bits(r.bits)}</b></div>`).join('');
}
function renderHeadlines() {
  const h = data.headlines;
  if (!h) return;
  $('hl-code').innerHTML = h.code.map(p => `<div><h4>${esc(p.title)} <span class="muted">· ${p.tasks} tasks</span></h4>${hlBars(p.rows, 'force reference')}</div>`).join('') || '<p class="muted">No finished runs.</p>';
}

/* --------------------------------------------------------------- findings */
function finding(eyebrow, big, unit, text) {
  return `<article class="panel pad finding"><span class="eyebrow">${eyebrow}</span><div class="big">${big}<small>${unit}</small></div><p>${text}</p></article>`;
}
function renderFindings() {
  const h = data.headlines || {}, cards = [];
  const he = (h.code || []).find(p => p.title.startsWith('HumanEval+ hard'));
  if (he && he.rows.length) {
    const ref = he.rows.find(r => r.label === 'force reference'), best = he.rows.reduce((a, b) => (b.bits < a.bits ? b : a));
    cards.push(finding('STUDY A · CODE', `${bits(ref.bits)} → ${bits(best.bits)}`, ' bits / task', `Qwen3-0.6B on the 39 hardest HumanEval+ tasks (${he.tasks} matched): forcing the reference vs the best protocol (${esc(best.label)}). Offline hints from Opus 5.5 agents beat a Qwen3-32B teacher on every testbed.`));
  }
  const tb = (h.long_horizon || []).find(x => x.student === 'qwen3-0.6b-base' && x.family === 'terminal-bench' && x.tasks);
  if (tb) {
    const ref = tb.totals['force benchmark reference'], opus = tb.totals['force Opus trajectory'];
    const best = Math.min(...Object.values(tb.totals));
    cards.push(finding('STUDY A · LONG HORIZON', `${bits(ref)} → ${bits(best)}`, ' bits', `Qwen3-0.6B, three terminal-bench tasks: the benchmark's reference vs the cheapest protocol. The trajectory the teacher injects is the main lever (Opus-written: ${bits(opus)}); letting the student act helps only once it can (Qwen3-8B).`));
  }
  const sb = data.study_b_summary;
  if (sb && sb.status === 'ready') {
    const inj = sb.matched.injection || {}, base = sb.matched.base_acc || {};
    const rel = sb.reliability.humanevalplus;
    cards.push(finding('STUDY B · PREDICTION', `ρ ${dec(inj.humanevalplus?.spearman, 2)} / ${dec(inj.mbppplus?.spearman, 2)}`, '', `Injection bits measured before SFT vs post-SFT HumanEval+ / MBPP+ accuracy over ${inj.humanevalplus?.n ?? '–'} checkpoints, the best of four predictors on code (base accuracy: ${dec(base.humanevalplus?.spearman, 2)} / ${dec(base.mbppplus?.spearman, 2)}); test-retest ρ ${dec(rel?.spearman, 3)}.`));
  }
  $('findings-cards').innerHTML = cards.join('');
}

/* -------------------------------------------------------- long-horizon sum */
function renderLhTotals() {
  const rows = (data.headlines?.long_horizon || []).filter(x => x.tasks);
  if (!rows.length) { $('lh-totals').innerHTML = '<tr><td class="muted">No finished runs.</td></tr>'; return; }
  const labels = [...new Set(rows.flatMap(x => Object.keys(x.totals)))];
  const free = {};
  for (const s of data.long_horizon?.students || []) free[s.student] = s.free;
  const head = `<thead><tr><th>student · family</th>${labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}<th class="num">unaided</th></tr></thead>`;
  const body = rows.map(x => {
    const best = Math.min(...Object.values(x.totals));
    const f = Object.entries(free[x.student] || {}).filter(([t]) => t.startsWith(x.family.startsWith('tau') ? 'tau' : 'tb'));
    const solved = f.reduce((a, [, v]) => a + v[0], 0), total = f.reduce((a, [, v]) => a + v[1], 0);
    return `<tr><td>${esc(x.student)} · ${esc(x.family)} <span class="muted">(${x.tasks} tasks)</span></td>${labels.map(l => x.totals[l] === undefined ? '<td class="num muted">–</td>' : `<td class="num${x.totals[l] === best ? ' best' : ''}">${bits(x.totals[l])}${x.se?.[l] ? `<small> ± ${bits(x.se[l])}</small>` : ''}</td>`).join('')}<td class="num">${total ? solved + '/' + total : '–'}</td></tr>`;
  }).join('');
  $('lh-totals').innerHTML = head + `<tbody>${body}</tbody>`;
}

/* ---------------------------------------------------------- study B tables */
function renderStudyBSummary() {
  const b = data.study_b_summary;
  if (!b || b.status !== 'ready') { $('sb-consistency').innerHTML = '<tr><td class="muted">Pending.</td></tr>'; return; }
  const names = {injection: 'injection bits', free_pass: 'unaided success', ref_bits: 'reference surprisal', base_acc: 'base accuracy'};
  const outs = {humanevalplus: 'HumanEval+', mbppplus: 'MBPP+', gsm8k: 'GSM8K', math500: 'MATH-500'};
  const block = (title, table) => {
    const best = {};
    for (const o of Object.keys(outs)) best[o] = Math.max(...Object.values(table).map(t => t[o]?.spearman ?? -9));
    return `<tr class="group"><td colspan="5">${esc(title)}</td></tr>` + Object.keys(names).map(p => `<tr><td>${names[p]}</td>${Object.keys(outs).map(o => { const c = table[p]?.[o]; return c ? `<td class="num${c.spearman === best[o] ? ' best' : ''}" data-tip="${tip(`n = ${c.n} · permutation p = ${dec(c.p, 4)}`)}">${dec(c.spearman, 2)}</td>` : '<td class="num muted">–</td>'; }).join('')}</tr>`).join('');
  };
  const n = b.matched.injection?.humanevalplus?.n ?? '–';
  let html = `<thead><tr><th>predictor (before SFT)</th>${Object.values(outs).map(o => `<th class="num">${o}</th>`).join('')}</tr></thead><tbody>` + block(`all checkpoints (n = ${n})`, b.matched);
  for (const [g, t] of Object.entries(b.within_family)) html += block(`within ${g} (same model, different pretraining tokens)`, t);
  $('sb-consistency').innerHTML = html + '</tbody>';
  $('sb-note').textContent = 'Injection bits and reference surprisal are negated (lower is better). Injection is measured on HumanEval+ and MBPP+ only; for GSM8K and MATH-500 the mean of the code measurements stands in. Highlight = best predictor per column.';
  $('sb-reliability').innerHTML = Object.entries(b.reliability).map(([s, r]) => `<div class="hl-row"><span>${outs[s] || s}</span><span class="muted">two independent replicates, ${r.n} checkpoints</span><b>ρ ${dec(r.spearman, 3)}</b></div><p class="muted" style="font-size:12px;margin:2px 0 10px">mean |difference| ${dec(r.mean_abs_diff_bits, 1)} bits per task</p>`).join('') + '<p class="note">Each checkpoint\'s injection cost was measured twice with different sampling seeds; the analysis uses their mean.</p>';
  const cols = [['injection', 'humanevalplus', 'inj HE+', true], ['injection', 'mbppplus', 'inj MBPP+', true], ['free_pass', 'humanevalplus', 'unaided HE+', false], ['ref_bits', 'humanevalplus', 'ref HE+', true]];
  const pc = (x) => isNum(x) ? (100 * x).toFixed(1) : '–';
  $('sb-rows').innerHTML = `<thead><tr><th>checkpoint</th>${cols.map(c => `<th class="num">${c[2]}</th>`).join('')}${Object.values(outs).map(o => `<th class="num">${o} base → SFT</th>`).join('')}</tr></thead><tbody>` + b.rows.map(r => `<tr><td>${esc(r.checkpoint)}</td>${cols.map(([p, o, , isBits]) => `<td class="num">${isBits ? bits(r.predictors[p]?.[o]) : pc(r.predictors[p]?.[o])}</td>`).join('')}${Object.keys(outs).map(o => `<td class="num">${pc(r.base[o])} → <b>${pc(r.outcome[o])}</b></td>`).join('')}</tr>`).join('') + '</tbody>';
}

/* ---------------------------------------------------------- long horizon */
function renderLongHorizon() {
  const lh = data.long_horizon, box = $('lh-tables');
  if (!lh || !lh.students || !lh.students.some(s => s.rows.length)) { box.innerHTML = '<div class="panel pending">No long-horizon runs yet.</div>'; return; }
  const short = t => t.replace('tau-retail-', 'tau ').replace('tb-', '');
  box.innerHTML = lh.students.filter(s => s.rows.length).map(s => {
    const head = `<tr><th>${esc(s.student)}</th>${s.tasks.map(t => `<th class="num">${esc(short(t))}</th>`).join('')}</tr>`;
    const free = `<tr class="muted"><td>free (successes / runs)</td>${s.tasks.map(t => { const f = s.free[t]; return `<td class="num">${f ? f[0] + '/' + f[1] : '–'}</td>`; }).join('')}</tr>`;
    const body = s.rows.map(r => `<tr><td>${esc(r.label)}</td>${s.tasks.map(t => { const c = r.cells[t]; return `<td class="num">${c ? bits(c.bits) + (c.success < 1 ? '*' : '') : '–'}</td>`; }).join('')}</tr>`).join('');
    return `<div class="panel"><div class="scroll"><table><thead>${head}</thead><tbody>${free}${body}</tbody></table></div></div>`;
  }).join('');
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
for (const id of ['f-student', 'f-protocol', 'f-status', 'f-search', 'f-smoke']) $(id).addEventListener('input', () => data && renderExperiments());
$('progress-student').addEventListener('change', () => data && renderProgress());
$('progress-suite').addEventListener('change', () => { if (data) { fillProgressStudents(); renderProgress(); } });
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

/* ------------------------------------------------------------- final eval */
function renderFinalEval() {
  const f = data.final_eval;
  const ids = ['fe-pairs', 'fe-delphi', 'fe-base', 'fe-post'];
  if (!f || f.status !== 'ready') {
    for (const id of ids) $(id).innerHTML = '<tr><td class="muted">Running: results appear as the jobs finish.</td></tr>';
    return;
  }
  const S = f.suites, L = f.suite_labels;
  const pairs = f.pairs?.hybrid || {}, fin = f.pairs?.final || {}, all = f.pairs?.all || {};
  const pnames = {injection: 'injection bits', reference: 'reference surprisal', unaided: 'unaided success'};
  const cell = (x, d = 2) => isNum(x) ? `<td class="num">${dec(x, d)}</td>` : '<td class="num muted">–</td>';
  let html = `<thead><tr><th>predictor (base model)</th>${S.map(s => `<th class="num">${L[s]}</th>`).join('')}</tr></thead><tbody>`;
  html += `<tr class="group"><td colspan="${S.length + 1}">across models: Spearman with post-trained accuracy (6 Qwen3 sizes)</td></tr>`;
  html += Object.keys(pnames).map(p => `<tr><td>${pnames[p]}</td>${S.map(s => cell(pairs[s]?.spearman?.[p])).join('')}</tr>`).join('');
  html += `<tr class="group"><td colspan="${S.length + 1}">across models: Spearman with accuracy of the final release (all families)</td></tr>`;
  html += Object.keys(pnames).map(p => `<tr><td>${pnames[p]}</td>${S.map(s => cell(fin[s]?.spearman?.[p])).join('')}</tr>`).join('');
  html += `<tr class="muted"><td>models</td>${S.map(s => `<td class="num">${fin[s]?.models?.length ?? '–'}</td>`).join('')}</tr>`;
  html += `<tr class="group"><td colspan="${S.length + 1}">per task: AUROC for "post-trained model solves it" (mean over all base / post-trained pairs)</td></tr>`;
  html += Object.keys(pnames).map(p => `<tr><td>${pnames[p]}</td>${S.map(s => cell(all[s]?.per_task?.[p]?.auroc)).join('')}</tr>`).join('');
  html += `<tr class="muted"><td>matched tasks</td>${S.map(s => `<td class="num">${pairs[s]?.n ?? all[s]?.n ?? '–'}</td>`).join('')}</tr>`;
  $('fe-pairs').innerHTML = html + '</tbody>';
  $('fe-pairs-note').textContent = 'Costs are negated, so higher = better predictor everywhere (1 = perfect). Solved = at least half of the post-trained model\'s samples correct. Columns fill in as base and post-trained runs finish.';
  const dl = f.delphi || {};
  const ds = S.filter(s => dl[s]);
  if (ds.length) {
    const pts = dl[ds[0]].points;
    $('fe-delphi').innerHTML = `<thead><tr><th>FLOPs · params</th>${ds.map(s => `<th class="num">${L[s]} <small>(${dl[s].n})</small></th>`).join('')}</tr></thead><tbody>` +
      pts.map((p, i) => `<tr><td>${p.flops.toExponential(0)} · ${p.params_b}B</td>${ds.map(s => `<td class="num">${bits(dl[s].points[i].injection)}</td>`).join('')}</tr>`).join('') +
      `<tr class="muted"><td>Spearman with log FLOPs</td>${ds.map(s => cell(dl[s].spearman_log_flops)).join('')}</tr></tbody>`;
    $('fe-delphi-note').textContent = 'Mean injection bits per task on tasks every Delphi model finished. Delphi has a 4096-token context: tau episodes that run out of it are not counted.';
  } else { $('fe-delphi').innerHTML = '<tr><td class="muted">Delphi runs not finished yet.</td></tr>'; }
  const triple = c => c ? `<td class="num">${bits(c.injection)} <span class="muted">/ ${bits(c.reference)} / ${pct(c.unaided)}</span> <small>(${c.n})</small></td>` : '<td class="num muted">–</td>';
  $('fe-base').innerHTML = `<thead><tr><th>base model</th>${S.map(s => `<th class="num">${L[s]}</th>`).join('')}</tr></thead><tbody>` +
    f.base.filter(r => Object.keys(r.suites).length).map(r => `<tr><td>${esc(r.model)}</td>${S.map(s => triple(r.suites[s])).join('')}</tr>`).join('') + '</tbody>';
  $('fe-post').innerHTML = `<thead><tr><th>post-trained model</th><th>base</th>${S.map(s => `<th class="num">${L[s]}</th>`).join('')}</tr></thead><tbody>` +
    f.post.filter(r => Object.keys(r.suites).length).map(r => `<tr><td>${esc(r.model)}</td><td class="muted">${esc(r.base)}</td>${S.map(s => r.suites[s] ? `<td class="num">${pct(r.suites[s].accuracy)} <small>(${r.suites[s].n})</small></td>` : '<td class="num muted">–</td>').join('')}</tr>`).join('') + '</tbody>';
  const am = f.aime || {};
  const ak = Object.keys(am);
  const pick = ['qwen3-0.6b-base', 'qwen3-8b-base', 'qwen3-30b-a3b-base', 'delphi-1e23', 'llama3.1-8b'];
  $('fe-aime').innerHTML = !ak.length ? '<tr><td class="muted">Running.</td></tr>' :
    `<thead><tr><th>protocol</th><th class="num">models</th>${pick.map(m => `<th class="num">${esc(m)}</th>`).join('')}<th class="num">Delphi ρ</th><th class="num">ρ Qwen3</th><th class="num">ρ all</th><th class="num">AUROC</th><th class="num">retest ρ</th></tr></thead><tbody>` +
    ak.map(k => { const e = am[k]; return `<tr><td>${esc(k)}</td><td class="num">${e.models}</td>${pick.map(m => `<td class="num">${bits(e.mean?.[m])}</td>`).join('')}${cell(e.delphi_spearman)}${cell(e.spearman_hybrid)}${cell(e.spearman_all)}${cell(e.auroc)}${cell(e.retest_spearman)}</tr>`; }).join('') + '</tbody>';
  const rel = f.reliability || {};
  const rs = S.filter(s => rel[s]);
  $('fe-reliability').innerHTML = !rs.length ? '<tr><td class="muted">Replicate runs pending.</td></tr>' :
    `<thead><tr><th></th>${rs.map(s => `<th class="num">${L[s]}</th>`).join('')}</tr></thead><tbody>` +
    `<tr><td>Spearman, per (model, task)</td>${rs.map(s => cell(rel[s].task_spearman, 3)).join('')}</tr>` +
    `<tr><td>Spearman of model means</td>${rs.map(s => cell(rel[s].model_spearman, 3)).join('')}</tr>` +
    `<tr><td>mean |difference|, bits per task</td>${rs.map(s => `<td class="num">${bits(rel[s].mean_abs_diff)}</td>`).join('')}</tr>` +
    `<tr class="muted"><td>models · (model, task) pairs</td>${rs.map(s => `<td class="num">${rel[s].models} · ${rel[s].pairs}</td>`).join('')}</tr></tbody>`;
  const con = f.contrast || {};
  const cm = Object.keys(con);
  $('fe-contrast').innerHTML = !cm.length ? '<tr><td class="muted">Running.</td></tr>' :
    `<thead><tr><th>base model</th>${['aime25', 'imoab'].map(s => `<th class="num">${L[s]}: all</th><th class="num">unsolved</th>`).join('')}</tr></thead><tbody>` +
    cm.map(m => `<tr><td>${esc(m)}</td>${['aime25', 'imoab'].map(s => { const c = con[m][s]; return c ? `<td class="num">${pct(c.prefers_gold)} <small>(${c.n})</small></td><td class="num">${pct(c.prefers_gold_unsolved)} <small>(${c.n_unsolved})</small></td>` : '<td class="num muted">–</td><td class="num muted">–</td>'; }).join('')}</tr>`).join('') + '</tbody>';
  $('fe-figures').innerHTML = (f.figures || []).map(n => `<figure class="panel pad"><img src="figures/${esc(n)}" alt="${esc(n)}" style="max-width:100%"></figure>`).join('');
}
