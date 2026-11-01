/* Swachh Campus Tracker — app.js
 * Part 1: Store (data layer: persistence, seeding, stats, upvotes, querying)
 * Part 2: UI   (rendering + event handling for index.html)
 */
'use strict';

/* ───────────── Config ───────────── */
const CATEGORIES = ['Hostels', 'Engineering Dept', 'Science Dept', 'Mess', 'Sports Grounds', 'Lecture Hall Complex', 'Library'];
const PRIORITIES = [{ key: 'low', label: 'Low', weight: 1 }, { key: 'medium', label: 'Medium', weight: 2 }, { key: 'high', label: 'High', weight: 3 }];
const STATUSES = ['open', 'progress', 'resolved'];
const STATUS_LABEL = { open: 'Open', progress: 'In progress', resolved: 'Resolved' };
const KEYS = { issues: 'swachh-campus-issues-v2', votes: 'swachh-campus-votes-v2', legacy: 'swachh-campus-issues-v1' };

const SEED_TEMPLATES = {
  'Hostels': [['Leaking tap in wash area', 'Hostel A', 'Ground floor'], ['Overflowing dustbins', 'Hostel B', 'Corridor 2'], ['Broken corridor light', 'Hostel C', '3rd floor'], ['Dirty common room', 'Hostel D', 'Common room'], ['Blocked drain behind block', 'Hostel A', 'Rear lane']],
  'Engineering Dept': [['Litter in workshop area', 'Mechanical Block', 'Workshop'], ['Clogged washroom sink', 'CSE Building', '2nd floor'], ['Dust on lab floors', 'ECE Block', 'Lab 4'], ['Water cooler not cleaned', 'Civil Block', 'Lobby'], ['Waste piled near canteen', 'Admin Annex', 'Back gate']],
  'Science Dept': [['Chemical spill residue', 'Chemistry Wing', 'Lab 2'], ['Broken fume hood fan', 'Chemistry Wing', 'Lab 5'], ['Stagnant water outside', 'Physics Block', 'Entrance'], ['Overflowing lab waste bin', 'Biology Block', 'Lab 1'], ['Dirty staircase', 'Science Complex', 'Stairwell B']],
  'Mess': [['Grease trap overflowing', 'Main Mess', 'Kitchen'], ['Flies near serving counter', 'Main Mess', 'Serving area'], ['Unwashed dining tables', 'North Mess', 'Dining hall'], ['Wet floor near entrance', 'South Mess', 'Entrance'], ['Food waste bins full', 'Main Mess', 'Back yard']],
  'Sports Grounds': [['Litter around pavilion', 'Cricket Ground', 'Pavilion'], ['Broken water fountain', 'Football Field', 'Sideline'], ['Unclean changing rooms', 'Sports Complex', 'Block A'], ['Overgrown grass on track', 'Athletics Track', 'Lane 4'], ['Plastic bottles in stands', 'Basketball Court', 'Bleachers']],
  'Lecture Hall Complex': [['Chalk dust and dirty boards', 'LHC', 'Hall 101'], ['Washroom out of soap', 'LHC', '1st floor'], ['Torn seats and litter', 'LHC', 'Hall 204'], ['Dustbins missing', 'LHC', 'Corridor'], ['Dirty windows', 'LHC', 'Hall 305']],
  'Library': [['Dust on reading tables', 'Central Library', 'Reading hall'], ['Food wrappers in stacks', 'Central Library', '2nd floor'], ['Washroom needs cleaning', 'Central Library', 'Ground floor'], ['Damp smell in archives', 'Central Library', 'Basement'], ['Broken bin near entrance', 'Central Library', 'Lobby']]
};

/* ───────────── Helpers ───────────── */
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const shuffle = arr => arr.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(p => p[1]);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const weightOf = i => PRIORITIES.find(p => p.key === i.priority).weight;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ───────────── Part 1: Store ───────────── */
const Store = (() => {
  let issues = [];
  let voted = new Set();   // issue ids this browser has upvoted
  let memory = {};         // fallback if localStorage is unavailable

  const read = key => { try { const v = localStorage.getItem(key); return v === null ? null : JSON.parse(v); } catch (e) { return key in memory ? memory[key] : null; } };
  const write = (key, val) => { memory[key] = val; try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage blocked; memory only */ } };
  const persist = () => { write(KEYS.issues, issues); write(KEYS.votes, [...voted]); };

  function generateSeed() {
    const now = Date.now(), DAY = 864e5, out = [];
    CATEGORIES.forEach(cat => {
      const picks = shuffle(SEED_TEMPLATES[cat]).slice(0, rand(3, 5));
      // guarantee a mix: first is resolved, second is pending, the rest are random
      picks.forEach(([title, building, location], idx) => {
        const status = idx === 0 ? 'resolved' : idx === 1 ? 'open' : STATUSES[rand(0, 2)];
        out.push({
          id: uid(), title, building, location, category: cat, status,
          priority: PRIORITIES[rand(0, 2)].key,
          upvotes: status === 'resolved' ? rand(0, 15) : rand(0, 40),
          created: now - rand(0, 30 * DAY)
        });
      });
    });
    return out;
  }

  function init() {
    let saved = read(KEYS.issues);
    if (saved === null) {
      const legacy = read(KEYS.legacy);   // carry over data from the first version of the tracker
      saved = Array.isArray(legacy) && legacy.length ? legacy.map(i => ({ ...i, upvotes: i.upvotes || 0 })) : generateSeed();
    }
    issues = Array.isArray(saved) ? saved : [];
    const v = read(KEYS.votes);
    voted = new Set(Array.isArray(v) ? v : []);
    persist();
  }

  const find = id => issues.find(i => i.id === id);

  function stats() {
    const total = issues.length;
    const count = s => issues.filter(i => i.status === s).length;
    const resolved = count('resolved'), open = count('open'), progress = count('progress');
    const upvotes = issues.reduce((a, i) => a + i.upvotes, 0);
    let health = 100;
    if (total) {
      const all = issues.reduce((a, i) => a + weightOf(i), 0);
      const done = issues.filter(i => i.status === 'resolved').reduce((a, i) => a + weightOf(i), 0);
      const part = issues.filter(i => i.status === 'progress').reduce((a, i) => a + weightOf(i), 0) * 0.4;
      health = Math.round((done + part) / all * 100);
    }
    const byCategory = {};
    CATEGORIES.forEach(c => {
      const list = issues.filter(i => i.category === c);
      byCategory[c] = { total: list.length, resolved: list.filter(i => i.status === 'resolved').length, upvotes: list.reduce((a, i) => a + i.upvotes, 0) };
    });
    return { total, resolved, open, progress, pending: open + progress, upvotes, health, byCategory };
  }

  function compare(sort) {
    const unresolvedFirst = (a, b) => (a.status === 'resolved') - (b.status === 'resolved');
    if (sort === 'newest') return (a, b) => b.created - a.created;
    if (sort === 'priority') return (a, b) => weightOf(b) - weightOf(a) || b.upvotes - a.upvotes || b.created - a.created;
    // default: most upvoted first, ties broken by unresolved, priority, then newest
    return (a, b) => b.upvotes - a.upvotes || unresolvedFirst(a, b) || weightOf(b) - weightOf(a) || b.created - a.created;
  }

  function query({ category = 'All', status = 'all', text = '', sort = 'votes' } = {}) {
    const q = text.trim().toLowerCase();
    return issues
      .filter(i => category === 'All' || i.category === category)
      .filter(i => status === 'all' || (status === 'pending' ? i.status !== 'resolved' : i.status === status))
      .filter(i => !q || [i.title, i.building, i.location, i.category].some(f => f.toLowerCase().includes(q)))
      .sort(compare(sort));
  }

  return {
    init, stats, query,
    all: () => issues,
    isVoted: id => voted.has(id),
    countIn: cat => cat === 'All' ? issues.length : issues.filter(i => i.category === cat).length,
    add(data) {
      const issue = { id: uid(), ...data, status: 'open', upvotes: 0, created: Date.now(), isNew: true };
      issues.push(issue); persist(); return issue;
    },
    toggleUpvote(id) {
      const i = find(id); if (!i) return;
      if (voted.has(id)) { voted.delete(id); i.upvotes = Math.max(0, i.upvotes - 1); }
      else { voted.add(id); i.upvotes += 1; }
      persist();
    },
    cycleStatus(id) { const i = find(id); if (i) { i.status = STATUSES[(STATUSES.indexOf(i.status) + 1) % 3]; persist(); } },
    remove(id) { issues = issues.filter(i => i.id !== id); voted.delete(id); persist(); },
    clearResolved() { const n = issues.filter(i => i.status === 'resolved').length; issues = issues.filter(i => i.status !== 'resolved'); persist(); return n; },
    addSamples() { issues = issues.concat(generateSeed()); persist(); },
    reset() { issues = []; voted = new Set(); persist(); },
    clearFlags() { issues.forEach(i => delete i.isNew); },
    exportJSON() { return JSON.stringify({ exportedAt: new Date().toISOString(), stats: stats(), issues }, null, 2); }
  };
})();

/* ───────────── Part 2: UI ───────────── */
const $ = id => document.getElementById(id);
const ui = { category: 'All', priority: 'medium', focusId: null, bumpId: null };

function renderStats() {
  const s = Store.stats();
  $('statTotal').textContent = s.total;
  $('statResolved').textContent = s.resolved;
  $('statPending').textContent = s.pending;
  $('statVotes').textContent = s.upvotes;
  $('healthPct').textContent = s.health + '%';
  $('ring').style.strokeDashoffset = 326.7 * (1 - s.health / 100);
  $('healthNote').textContent = !s.total ? 'No issues logged yet. A clean slate.'
    : s.health >= 80 ? 'Looking great. Keep it up.'
    : s.health >= 50 ? 'Getting there. Tackle the most upvoted ones first.'
    : 'Needs attention. Several urgent issues are still open.';
}

function renderFilters() {
  $('filters').innerHTML = ['All', ...CATEGORIES].map(c =>
    `<button type="button" class="pill" data-cat="${esc(c)}" aria-pressed="${c === ui.category}">${esc(c)}<small>${Store.countIn(c)}</small></button>`).join('');
}

function cardHTML(i) {
  const prio = PRIORITIES.find(p => p.key === i.priority);
  const done = i.status === 'resolved';
  const next = i.status === 'open' ? 'Start work' : i.status === 'progress' ? 'Mark resolved' : 'Reopen';
  const voted = Store.isVoted(i.id);
  const date = new Date(i.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `<article class="card ${done ? 'done' : ''} ${i.isNew ? 'card-in' : ''} rounded-2xl bg-surface border border-line border-l-4 edge-${i.priority} p-4 flex gap-3" data-id="${i.id}">
    <button type="button" class="vote self-start" data-act="vote" data-id="${i.id}" aria-pressed="${voted}" aria-label="${voted ? 'Remove upvote' : 'Upvote'}: ${i.upvotes} upvotes">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 3l7 9h-4.5v5h-5v-5H3z"/></svg>
      <span>${i.upvotes}</span>
    </button>
    <div class="flex-1 min-w-0 flex flex-col gap-3">
      <div class="flex items-start justify-between gap-2">
        <h3 class="font-head font-bold text-lg leading-snug">${esc(i.title)}</h3>
        <span class="tag-${i.priority} text-xs font-semibold rounded-full px-2.5 py-1 shrink-0">${prio.label}</span>
      </div>
      <p class="text-sm text-muted">${esc(i.building)}, ${esc(i.location)}</p>
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="rounded-full px-2.5 py-1" style="background:var(--soft)">${esc(i.category)}</span>
        <span class="text-muted">${STATUS_LABEL[i.status]} · ${date}</span>
      </div>
      <div class="flex gap-2 mt-auto pt-1">
        <button class="btn flex-1" data-act="next" data-id="${i.id}" style="${i.status === 'progress' ? 'background:var(--leaf);color:#fff' : 'background:var(--soft);color:var(--ink)'}">${next}</button>
        <button class="btn border border-line text-muted" data-act="del" data-id="${i.id}" aria-label="Delete issue">Delete</button>
      </div>
    </div>
  </article>`;
}

function renderGrid() {
  const list = Store.query({ category: ui.category, status: $('qStatus').value, text: $('qSearch').value, sort: $('qSort').value });
  $('shownCount').textContent = list.length ? `(${list.length})` : '';
  $('empty').classList.toggle('hidden', list.length > 0);
  if (!list.length) {
    const any = Store.all().length > 0;
    $('emptyMsg').textContent = any ? 'No issues match these filters' : 'No issues yet';
    $('emptySub').textContent = any ? 'Try another category, status or search.' : 'Use the form to log the first one, or add sample issues.';
  }
  $('grid').innerHTML = list.map(cardHTML).join('');
  Store.clearFlags();
  // keep keyboard focus and play the bump on the button the person just used
  if (ui.focusId) {
    const btn = $('grid').querySelector(`.vote[data-id="${ui.focusId}"]`);
    if (btn) { btn.focus({ preventScroll: true }); if (ui.bumpId === ui.focusId) btn.classList.add('bump'); }
    ui.focusId = ui.bumpId = null;
  }
}

function render() { renderStats(); renderFilters(); renderGrid(); }

function renderPriority() {
  $('prioGroup').innerHTML = PRIORITIES.map(p =>
    `<button type="button" class="pill tag-${p.key}" data-prio="${p.key}" aria-pressed="${ui.priority === p.key}" style="text-align:center;font-weight:600;${ui.priority === p.key ? 'border-color:currentColor;box-shadow:inset 0 0 0 1px currentColor' : ''}">${p.label}</button>`).join('');
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function bindEvents() {
  $('prioGroup').addEventListener('click', e => { const b = e.target.closest('[data-prio]'); if (b) { ui.priority = b.dataset.prio; renderPriority(); } });
  $('filters').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { ui.category = b.dataset.cat; render(); } });
  ['qStatus', 'qSort'].forEach(id => $(id).addEventListener('change', renderGrid));
  $('qSearch').addEventListener('input', renderGrid);

  $('issueForm').addEventListener('submit', e => {
    e.preventDefault();
    const category = $('fCategory').value;
    if (!category) { $('fCategory').focus(); return; }
    Store.add({ title: $('fTitle').value.trim(), building: $('fBuilding').value.trim(), location: $('fLocation').value.trim(), category, priority: ui.priority });
    e.target.reset(); $('fCategory').selectedIndex = 0; ui.priority = 'medium'; renderPriority();
    if (ui.category !== 'All' && ui.category !== category) ui.category = 'All';
    render();
  });

  $('grid').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === 'vote') { Store.toggleUpvote(id); ui.focusId = ui.bumpId = id; }
    else if (b.dataset.act === 'next') Store.cycleStatus(id);
    else if (b.dataset.act === 'del') Store.remove(id);
    render();
  });

  $('clearResolved').addEventListener('click', () => {
    const n = Store.stats().resolved;
    if (n && confirm(`Remove ${n} resolved issue${n > 1 ? 's' : ''}? This lowers the logged and resolved totals.`)) { Store.clearResolved(); render(); }
  });
  $('btnSample').addEventListener('click', () => { Store.addSamples(); render(); });
  $('btnExport').addEventListener('click', () => download('swachh-campus-issues.json', Store.exportJSON()));
  $('btnReset').addEventListener('click', () => { if (confirm('Delete all issues and upvotes? This cannot be undone.')) { Store.reset(); ui.category = 'All'; render(); } });
}

document.addEventListener('DOMContentLoaded', () => {
  Store.init();
  $('fCategory').innerHTML = '<option value="" disabled selected>Choose a category</option>' + CATEGORIES.map(c => `<option>${c}</option>`).join('');
  renderPriority(); bindEvents(); render();
  window.SwachhStore = Store;   // handy for inspecting stats() from the browser console
});