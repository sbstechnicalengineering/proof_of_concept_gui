(function () {
'use strict';
var app = document.getElementById('app'), crumbs = document.getElementById('crumbs');
var qIn = document.getElementById('q');
var PAGE = 100;

function $(t, cls, html) { var e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function img(u) { return !u ? '' : (u.charAt(0) === '~' ? SBS.PREFIX + u.slice(1) : u); }
function fmt(n) { return Number(n).toLocaleString(); }
function natKey(s) {
  var t = String(s).replace(/^#\s*/, '').replace(/["']/g, ''), m;
  if ((m = t.match(/^(\d+)?[ -]?(\d+)\/(\d+)/))) return [0, (+m[1] || 0) + m[2] / m[3], s];
  if ((m = t.match(/^-?(\d+(?:\.\d+)?)/))) return [0, parseFloat(m[1]), s];
  return [1, 0, String(s).toLowerCase()];
}
function natCmp(a, b) { var x = natKey(a), y = natKey(b); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); }
function shopUrl(pn) { return 'https://shop.specialtybolt.com/products/search/?Keyword=' + encodeURIComponent(pn); }
var EXT = '<svg class="ext" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M9 2h5v5M14 2 7 9M12 9v4H3V4h4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
function parseQS(s) {
  var o = {}; if (!s) return o;
  s.split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) o[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
  return o;
}

/* ---------- tree / data loading ---------- */
function nodeAt(segs) {
  var n = SBS.TREE;
  for (var i = 0; i < segs.length; i++) {
    var k = null;
    for (var j = 0; j < n.kids.length; j++) if (n.kids[j].name === segs[i]) { k = n.kids[j]; break; }
    if (!k) return null; n = k;
  }
  return n;
}
function loadScript(src, cb) { var s = document.createElement('script'); s.src = src; s.onload = function () { cb(); }; s.onerror = function () { cb(true); }; document.head.appendChild(s); }
SBS._pend = {};
function loadCat(id, cb) {
  if (SBS._cats[id]) return cb(SBS._cats[id]);
  if (SBS._pend[id]) { SBS._pend[id].push(cb); return; }
  SBS._pend[id] = [cb];
  SBS._catCb[id] = function (c) { var l = SBS._pend[id]; delete SBS._pend[id]; l.forEach(function (f) { f(c); }); };
  loadScript('data/cat_' + id + '.js', function (err) { if (err) { var l = SBS._pend[id]; delete SBS._pend[id]; (l || []).forEach(function (f) { f(null); }); } });
}
function loadSearch(cb) {
  if (SBS.IDX) return cb();
  SBS._searchCb = cb; loadScript('data/search.js', function (err) { if (err) cb(true); });
}
function catIndex() {
  if (SBS._ci) return SBS._ci;
  var m = {}; (function walk(n) { n.cats.forEach(function (c) { m[c.id] = c; }); n.kids.forEach(walk); })(SBS.TREE);
  return (SBS._ci = m);
}
function allCats(n, out) { out = out || []; n.cats.forEach(function (c) { out.push(c); }); n.kids.forEach(function (k) { allCats(k, out); }); return out; }
function href(segs) { return '#/g/' + segs.map(encodeURIComponent).join('/'); }

/* ---------- breadcrumbs ---------- */
function setCrumbs(parts) {
  crumbs.innerHTML = '';
  parts.forEach(function (p, i) {
    if (i) crumbs.appendChild($('span', 'sep', '&rsaquo;'));
    if (p.href) { var a = $('a'); a.href = p.href; a.textContent = p.t; crumbs.appendChild(a); }
    else crumbs.appendChild($('b', null, esc(p.t)));
  });
}
function groupCrumbs(segs, last) {
  var out = [{ t: 'All Categories', href: '#/' }];
  segs.forEach(function (s, i) { out.push({ t: s, href: (i === segs.length - 1 && !last) ? null : href(segs.slice(0, i + 1)) }); });
  return out;
}
/* parent category label: SBS orange, FULL CAPS */
function titleBlock(parent, title) {
  var d = $('div');
  if (parent) { d.appendChild($('div', 'parent', esc(parent))); d.appendChild($('h1', null, esc(title))); }
  else d.appendChild($('h1', 'top', esc(title)));
  return d;
}

/* ---------- linear dimensions (min / max filter) ---------- */
var LINEAR = /(^|[^a-z])(length|diameter|grip|width|thickness|height|depth|od|id)([^a-z]|$)/i;
function numTok(t) {
  var m; t = t.trim();
  if ((m = t.match(/^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)/))) return +m[1] + m[2] / m[3];
  if ((m = t.match(/^(\d+)\s*\/\s*(\d+)/))) return m[1] / m[2];
  if ((m = t.match(/^\d*\.?\d+/))) return parseFloat(m[0]);
  return null;
}
/* "1 1/4 \"", "25 mm", "1/16 - 1/8" -> [lo, hi] in inches, or null */
function parseLen(s) {
  s = String(s).toLowerCase().replace(/[”″“]/g, '"');
  var u = /mm/.test(s) ? 1 / 25.4 : /cm/.test(s) ? 1 / 2.54 : 1;
  var body = s.replace(/mm|cm|\bin(ch(es)?)?\b|"/g, ' ').replace(/\s+/g, ' ').trim();
  var m = body.match(/^(.+?)\s+(?:-|to)\s+(.+)$/);
  if (m) { var a = numTok(m[1]), b = numTok(m[2]); if (a != null && b != null) return [a * u, b * u]; }
  var x = numTok(body); return x == null ? null : [x * u, x * u];
}
function rangeOK(nums, code, rg) {
  var v = nums && nums[code]; if (!v) return false;
  var lo = rg.min === '' || rg.min == null ? -Infinity : rg.min * (rg.unit === 'mm' ? 1 / 25.4 : 1);
  var hi = rg.max === '' || rg.max == null ? Infinity : rg.max * (rg.unit === 'mm' ? 1 / 25.4 : 1);
  return v[0] <= hi + 1e-6 && v[1] >= lo - 1e-6;
}
function rangeActive(rg) { return rg && ((rg.min !== '' && rg.min != null) || (rg.max !== '' && rg.max != null)); }

/* ---------- shared facet block (list, min/max box, common/uncommon ranking) ---------- */
var RANKED = { 'Material': 'MATERIALS', 'Grade': 'GRADES', 'Finish': 'FINISHES', 'Thread': 'THREAD SIZES', 'Thread Pitch': 'THREAD PITCHES', 'Standard / Type': 'STANDARDS / TYPES' };
var GUIDES = { 'Material': ['Material & Grade Guide', 'https://shop.specialtybolt.com/technical/material-and-grade'],
  'Grade': ['Material & Grade Guide', 'https://shop.specialtybolt.com/technical/material-and-grade'],
  'Standard / Type': ['SBS Standards Library', 'https://shop.specialtybolt.com/technical/consensusstandardslibrary'],
  'Finish': ['Finish & Plating Guide', 'https://shop.specialtybolt.com/technical/plating-and-coating'],
  'Head Style': ['Head Style Guide', 'https://shop.specialtybolt.com/technical/head_styles'],
  'Drive': ['Drive Style Guide', 'https://shop.specialtybolt.com/technical/drives'] };
var TILES = { 'Drive': 1, 'Head Style': 1 };
function guideLink(name) {
  var g = GUIDES[name]; if (!g) return null;
  var e = $('a', 'guide', 'Guide ' + EXT); e.title = g[0]; e.href = g[1]; e.target = '_blank'; e.rel = 'noopener noreferrer'; e.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); window.open(g[1], '_blank', 'noopener'); }; return e;
}
/* placeholder icons (generated SVG) for drive and head-style values */
function star(n, r1, r2) { var p = []; for (var i = 0; i < 2 * n; i++) { var r = i % 2 ? r2 : r1, t = (-90 + i * 180 / n) * Math.PI / 180; p.push((28 + r * Math.cos(t)).toFixed(1) + ',' + (28 + r * Math.sin(t)).toFixed(1)); } return p.join(' '); }
function poly(n, r, rot) { var p = []; for (var i = 0; i < n; i++) { var t = (rot + i * 360 / n) * Math.PI / 180; p.push((28 + r * Math.cos(t)).toFixed(1) + ',' + (28 + r * Math.sin(t)).toFixed(1)); } return p.join(' '); }
function driveSvg(label) {
  var l = label.toLowerCase(), g;
  if (/no drive|none/.test(l)) g = '';
  else if (/phillips|pozi|jis|frearson|torq-set|mortorq|cross/.test(l)) g = '<path d="M26 12h4v14h14v4H30v14h-4V30H12v-4h14z" fill="#fff"/>';
  else if (/slot|one way|clutch/.test(l)) g = '<rect x="10" y="25" width="36" height="6" fill="#fff"/>';
  else if (/torx|lobe|star|spline|ribe|12-point|tri-/.test(l)) g = '<polygon points="' + star(/12/.test(l) ? 12 : 6, 15, 10.5) + '" fill="#fff"/>';
  else if (/pentagon/.test(l)) g = '<polygon points="' + poly(5, 15, -90) + '" fill="#fff"/>';
  else if (/triang|tri-wing|y-type/.test(l)) g = '<polygon points="' + poly(3, 16, -90) + '" fill="#fff"/>';
  else if (/square/.test(l)) g = '<rect x="16" y="16" width="24" height="24" fill="#fff"/>';
  else if (/hex|wrench/.test(l)) g = '<polygon points="' + poly(6, 15, 0) + '" fill="#fff"/>';
  else g = '<circle cx="28" cy="28" r="6" fill="#fff"/>';
  return '<svg viewBox="0 0 56 56" width="52" height="52"><circle cx="28" cy="28" r="25" fill="#111"/>' + g + '</svg>';
}
function headSvg(label) {
  var l = label.toLowerCase(), h, thr = '<path d="M21 32h14M21 37h14M21 42h14M21 47h14M21 52h14"/>', shank = '<rect x="21" y="26" width="14" height="34"/>';
  if (/flat|oval|counter/.test(l)) h = '<path d="M7 12h42L36 26H20z"/><path d="M24 17h8"/>';
  else if (/round|pan|button|binding|truss|dome|cheese|fillister|pancake/.test(l)) h = '<path d="M9 26c0-13 8-17 19-17s19 4 19 17z"/>';
  else if (/flange/.test(l)) h = '<path d="M11 10h34v12H11z"/><path d="M5 26h46v-4H5z"/>';
  else if (/hex/.test(l)) h = '<path d="M12 10h32v16H12z"/><path d="M22 10v16M34 10v16"/>';
  else if (/socket|cap/.test(l)) h = '<path d="M14 11h28v15H14z"/><ellipse cx="28" cy="11" rx="14" ry="3.5"/><path d="M23 15h10v5H23z"/>';
  else if (/set|headless|stud|none/.test(l)) h = '';
  else h = '<path d="M12 12h32a2 2 0 0 1 2 2v12H10V14a2 2 0 0 1 2-2z"/>';
  return '<svg viewBox="0 0 56 64" width="46" height="52" fill="#fff" stroke="#222" stroke-width="1.4" stroke-linejoin="round">' + h + shank + thr + '</svg>';
}
/* o: name, allKeys, live{key:count}, base{key:count}, label(k), isSel(k), toggle(k), search{}, open{},
      linear (bool), range (state obj or null), setRange(min,max,unit), defUnit */
function facetBlock(side, o) {
  var keys = o.allKeys.filter(function (k) { return o.live[k] || o.isSel(k); });
  var anySel = o.allKeys.some(function (k) { return o.isSel(k); });
  if (keys.length < 2 && !anySel && !rangeActive(o.range)) return;
  var ranked = !!RANKED[o.name];

  function listInto(box, ks, byRank) {
    var list = $('div', 'fl' + (TILES[o.name] ? ' tiles' : '')), name = o.name;
    ks = ks.slice().sort(function (a, b) {
      if (byRank) return (o.base[b] || 0) - (o.base[a] || 0) || natCmp(o.label(a), o.label(b));
      return natCmp(o.label(a), o.label(b));
    });
    function fill() {
      list.innerHTML = ''; var term = (o.search[name] || '').toLowerCase();
      ks.forEach(function (k) {
        var lb = o.label(k); if (term && lb.toLowerCase().indexOf(term) < 0) return;
        var el = TILES[name]
          ? $('a', 'tl' + (o.isSel(k) ? ' on' : ''), '<span class="ti">' + (name === 'Drive' ? driveSvg(lb) : headSvg(lb)) + '</span><span class="tn">' + esc(lb) + '</span><span class="n">' + (o.live[k] ? fmt(o.live[k]) : '') + '</span>')
          : $('a', o.isSel(k) ? 'on' : '', '<span>' + esc(lb) + '</span><span class="n">' + (o.live[k] ? fmt(o.live[k]) : '') + '</span>');
        el.onclick = function () { o.toggle(k); }; list.appendChild(el);
      });
    }
    if (ks.length > 10) {
      var si = $('input'); si.type = 'search'; si.placeholder = 'Search'; si.value = o.search[name] || '';
      si.oninput = function () { o.search[name] = si.value; fill(); }; box.appendChild(si);
    }
    if (ks.length <= 6) box.className += ' short';
    fill(); box.appendChild(list);
  }

  if (!ranked) {
    var b = $('div', 'fb'), h3 = $('h3', null, '<span>' + esc(o.name) + '</span>'), gl = guideLink(o.name); if (gl) h3.appendChild(gl); b.appendChild(h3);
    if (o.linear) b.appendChild(rangeBox(o));
    listInto(b, keys, false); side.appendChild(b); return;
  }
  /* ranked: COMMON = smallest set covering 80% of items in the grouping, UNCOMMON = the rest (expand to see) */
  var tot = 0; o.allKeys.forEach(function (k) { tot += o.base[k] || 0; });
  var order = o.allKeys.slice().sort(function (a, b) { return (o.base[b] || 0) - (o.base[a] || 0); });
  var common = {}, cum = 0;
  for (var i = 0; i < order.length && cum < 0.8 * tot; i++) { common[order[i]] = 1; cum += o.base[order[i]] || 0; }
  var ck = keys.filter(function (k) { return common[k]; }), uk = keys.filter(function (k) { return !common[k]; });
  var cb = $('div', 'fb'), ch3 = $('h3', null, '<span>COMMON ' + RANKED[o.name] + '</span>'), gl2 = guideLink(o.name); if (gl2) ch3.appendChild(gl2); cb.appendChild(ch3);
  if (ck.length) listInto(cb, ck, true); else cb.appendChild($('div', 'none', 'No common values match'));
  side.appendChild(cb);
  if (uk.length) {
    var ub = $('div', 'fb unc'), isOpen = o.open[o.name] || uk.some(function (k) { return o.isSel(k); });
    var h = $('h3', 'tog', 'UNCOMMON ' + RANKED[o.name] + ' (' + uk.length + ') <span>' + (isOpen ? '&#9662;' : '&#9656;') + '</span>');
    h.onclick = function () { o.open[o.name] = !isOpen; o.redraw(); };
    ub.appendChild(h); if (isOpen) listInto(ub, uk, true); side.appendChild(ub);
  }
}
function rangeBox(o) {
  var rg = o.range || { min: '', max: '', unit: o.defUnit }, box = $('div', 'rng');
  box.innerHTML = '<input class="mn" type="text" inputmode="decimal" placeholder="Min" value="' + esc(rg.min) + '"> <span>to</span> <input class="mx" type="text" inputmode="decimal" placeholder="Max" value="' + esc(rg.max) + '"> ' +
    '<select><option value="in"' + (rg.unit === 'in' ? ' selected' : '') + '>in</option><option value="mm"' + (rg.unit === 'mm' ? ' selected' : '') + '>mm</option></select>';
  var mn = box.querySelector('.mn'), mx = box.querySelector('.mx'), un = box.querySelector('select');
  function num(v) { var n = numTok(v.replace(/^\s+|\s+$/g, '')); return n == null ? '' : n; }
  function apply() { o.setRange(num(mn.value), num(mx.value), un.value); }
  mn.onchange = mx.onchange = un.onchange = apply;
  [mn, mx].forEach(function (e) { e.onkeydown = function (ev) { if (ev.key === 'Enter') apply(); }; });
  return box;
}

/* ---------- info pop-out (right hand side) ---------- */
var panel = $('aside'); panel.id = 'info'; document.body.appendChild(panel);
var LOREM = ['Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'];
function closePanel() { document.body.classList.remove('panel-open'); panel.innerHTML = ''; }
function openPanel(it, parent, onBack) {
  panel.innerHTML = '';
  function back() { var b = $('button', 'pback', '&larr; Back to category cards'); b.onclick = function () { closePanel(); onBack(); }; return b; }
  panel.appendChild(back());
  var imgs = (it.imgs || []).filter(Boolean);
  if (imgs.length) {
    var ph = $('div', 'pimgs n' + Math.min(imgs.length, 4));
    imgs.slice(0, 4).forEach(function (u) { var f = $('div', 'pi'), i = $('img'); i.alt = ''; i.src = u; i.onerror = function () { f.style.display = 'none'; }; f.appendChild(i); ph.appendChild(f); });
    panel.appendChild(ph); panel.appendChild($('div', 'pcap', 'Sample images – placeholder'));
  }
  if (parent) panel.appendChild($('div', 'parent', esc(parent)));
  panel.appendChild($('h2', null, esc(it.name)));
  panel.appendChild($('h4', null, 'What are ' + esc(it.name) + '?'));
  LOREM.forEach(function (t) { panel.appendChild($('p', null, t)); });
  if (it.subs && it.subs.length) {
    panel.appendChild($('h4', null, 'Subcategories'));
    var ul = $('ul'); it.subs.forEach(function (s) { ul.appendChild($('li', null, '<a href="' + s.href + '">' + esc(s.name) + '</a> <span class="n">' + fmt(s.n) + '</span>')); }); panel.appendChild(ul);
  }
  var rel = relFor(it.relKey || '');
  if (rel.length) {
    panel.appendChild($('h4', null, 'Related categories'));
    var rul = $('ul'); rel.forEach(function (x) { rul.appendChild($('li', null, '<a href="' + x.link + '">' + esc(x.name) + '</a> <span class="n">' + fmt(x.n) + '</span>')); }); panel.appendChild(rul);
  }
  panel.appendChild($('h4', null, 'Design guide'));
  var fake = function (t) { return '<li><a href="#" onclick="return false">' + esc(t) + '</a> <span class="n">sample link</span></li>'; };
  panel.appendChild($('ul', null, fake(it.name + ' Design Guide (PDF)') + fake(it.name + ' Selection Tips')));
  panel.appendChild($('h4', null, 'Consensus standards'));
  panel.appendChild($('ul', null, fake('ASME B18.6.3 – ' + it.name) + fake('ASTM F835 – Standard Specification for ' + it.name) + fake('ISO 898-1 – Mechanical properties of fasteners') + fake('DIN 912 – ' + it.name)));
  panel.appendChild(back());
  document.body.classList.add('panel-open'); panel.scrollTop = 0;
}

/* ---------- related categories (cross-reference built from the McMaster 'Other Products' audit) ---------- */
function relFor(key) {
  var out = [], ci = catIndex();
  ((SBS.REL || {})[key] || []).forEach(function (r) {
    if (r[1] === 'c' && ci[r[2]]) { var c = ci[r[2]]; out.push({ name: c.name, img: c.img, n: c.n, link: '#/c/' + c.id }); }
    else if (r[1] === 'g') { var segs = r[0].split(' > '), nd = nodeAt(segs); if (nd) out.push({ name: segs[segs.length - 1], img: nd.img, n: nd.n, link: href(segs) }); }
  });
  return out;
}
function relSection(key) {
  var items = relFor(key); if (!items.length) return null;
  var sec = $('section', 'relsec' + (SBS._relHidden ? ' collapsed' : '')), head = $('div', 'relhead');
  head.appendChild($('h3', null, 'Related categories'));
  var tg = $('button', 'relbtn'); tg.type = 'button';
  function paint() { tg.innerHTML = SBS._relHidden ? '&#9660;' : '&#9650; Hide'; tg.title = SBS._relHidden ? 'Show related categories' : 'Hide related categories'; sec.classList.toggle('collapsed', !!SBS._relHidden); }
  tg.onclick = function () { SBS._relHidden = !SBS._relHidden; paint(); };
  head.appendChild(tg); sec.appendChild(head); paint();
  var row = $('div', 'relrow');
  items.forEach(function (x) {
    var a = $('a', 'rt'); a.href = x.link; a.appendChild(imgEl(x.img, x.name));
    a.appendChild($('span', 'lb', esc(x.name))); a.appendChild($('span', 'ct', fmt(x.n) + ' SKUs')); row.appendChild(a);
  });
  sec.appendChild(row); return sec;
}

/* ---------- front page: category rail + icon sections ---------- */
function imgEl(src, name) {
  var wrap = $('div', 'im');
  function ph() { wrap.innerHTML = '<span class="ph">' + esc(name.charAt(0)) + '</span>'; }
  if (src) { var i = $('img'); i.loading = 'lazy'; i.alt = ''; i.src = src; i.onerror = ph; wrap.appendChild(i); } else ph();
  return wrap;
}
function icon(name, n, src, link) {
  var a = $('a', 'ic'); a.href = link; a.appendChild(imgEl(src, name));
  a.appendChild($('span', 'lb', esc(name))); a.appendChild($('span', 'ct', fmt(n))); return a;
}
function showHome() {
  setCrumbs([]); document.title = 'SBS Catalog | Specialty Bolt and Screw';
  var T = SBS.TREE, wrap = $('div', 'home'), rail = $('nav', 'rail'), main = $('div', 'homemain');
  rail.appendChild($('h2', null, 'Choose a Category'));
  T.kids.forEach(function (k) { var a = $('a', null, '<span>' + esc(k.name) + '</span><span class="n">(' + fmt(k.n) + ')</span>'); a.href = href([k.name]); rail.appendChild(a); });
  main.appendChild($('h2', 'allcat', 'All Categories'));
  T.kids.forEach(function (k) {
    var sec = $('section', 'sec');
    sec.appendChild($('h2', null, '<a href="' + href([k.name]) + '">' + esc(k.name) + '</a> <span class="n">(' + fmt(k.n) + ' SKUs)</span>'));
    var row = $('div', 'icons');
    k.kids.forEach(function (c) { row.appendChild(icon(c.name, c.n, c.img, href([k.name, c.name]))); });
    k.cats.forEach(function (c) { row.appendChild(icon(c.name, c.n, c.img, '#/c/' + c.id)); });
    sec.appendChild(row); main.appendChild(sec);
  });
  wrap.appendChild(rail); wrap.appendChild(main); app.innerHTML = ''; app.appendChild(wrap); window.scrollTo(0, 0);
}

/* ---------- group page: category cards + attribute filters + SKU list ---------- */
var LIMIT = 40000, PREF = ['Measurement System', 'Material', 'Grade', 'Finish', 'Standard / Type', 'Thread', 'Thread Pitch', 'Thread Type', 'Length', 'Head Style', 'Drive'];
var COLS = ['Thread', 'Length', 'Material', 'Finish', 'Drive', 'Head Style'];
function vkey(v) { return String(v).replace(/\s+/g, ' ').trim().toLowerCase(); }

function showNode(segs, qs) {
  var n = nodeAt(segs);
  if (!n) { app.innerHTML = '<div class="empty">Category not found.</div>'; return; }
  setCrumbs(groupCrumbs(segs)); document.title = segs[segs.length - 1] + ' | SBS Catalog';
  var tok = SBS._tok;
  var st = {}; try { st = JSON.parse(parseQS(qs).s || '{}'); } catch (e) { st = {}; }
  var sel = {}, rng = st.r || {}, picked = {}, excl = {}, catMenu = false, closeH = null, info = null, openU = {}, search = {}, shown = PAGE;
  Object.keys(st.f || {}).forEach(function (k) { sel[k] = {}; st.f[k].forEach(function (v) { sel[k][v] = 1; }); });
  (st.p || []).forEach(function (k) { picked[k] = 1; });
  (st.x || []).forEach(function (k) { excl[k] = 1; });
  var cats = allCats(n), loaded = {}, attrs = null, nLoaded = 0, canFilter = n.n <= LIMIT, title = segs[segs.length - 1];
  var parent = segs.length > 1 ? segs[0] : null;
  var wrap = $('div', 'layout'), side = $('aside', 'filters'), main = $('div', 'main');
  wrap.appendChild(side); wrap.appendChild(main); app.innerHTML = ''; app.appendChild(wrap);

  function saveState() {
    var f = {}; Object.keys(sel).forEach(function (k) { f[k] = Object.keys(sel[k]); });
    var r = {}; Object.keys(rng).forEach(function (k) { if (rangeActive(rng[k])) r[k] = rng[k]; });
    var s = {}; if (Object.keys(f).length) s.f = f; if (Object.keys(r).length) s.r = r; if (Object.keys(picked).length) s.p = Object.keys(picked); if (Object.keys(excl).length) s.x = Object.keys(excl);
    history.replaceState(null, '', href(segs) + (Object.keys(s).length ? '?s=' + encodeURIComponent(JSON.stringify(s)) : ''));
  }
  function isActive() { return Object.keys(sel).length > 0 || Object.keys(rng).some(function (k) { return rangeActive(rng[k]); }); }
  function prepare() {
    var weight = {}, labels = {};
    cats.forEach(function (c) {
      var d = loaded[c.id]; if (!d) return; d._m = {};
      d.filters.forEach(function (f, i) {
        if (/^(RoHS|REACH|PROP 65)/.test(f.n)) return;
        d._m[f.n] = { idx: i, keys: f.v.map(vkey), nums: LINEAR.test(f.n) ? f.v.map(parseLen) : null };
        weight[f.n] = (weight[f.n] || 0) + d.rows.length * f.f; labels[f.n] = labels[f.n] || {};
      });
      d.rows.forEach(function (r) {
        for (var nm in d._m) {
          var m = d._m[nm], code = r[4 + m.idx];
          if (code >= 0) { var L = labels[nm], k = m.keys[code], s = d.filters[m.idx].v[code]; L[k] = L[k] || {}; L[k][s] = (L[k][s] || 0) + 1; }
        }
      });
    });
    var names = Object.keys(weight).filter(function (k) { return weight[k] / n.n >= 0.15; });
    names.sort(function (a, b) { var pa = PREF.indexOf(a), pb = PREF.indexOf(b); if (pa < 0) pa = 99; if (pb < 0) pb = 99; return pa - pb || weight[b] - weight[a]; });
    attrs = names.slice(0, 14).map(function (nm) {
      var lab = {}, base = {}, mm = 0, tot = 0;
      Object.keys(labels[nm]).forEach(function (k) {
        var best = null, bc = -1, sum = 0;
        for (var s in labels[nm][k]) { sum += labels[nm][k][s]; if (labels[nm][k][s] > bc) { bc = labels[nm][k][s]; best = s; } }
        lab[k] = best.replace(/\s+/g, ' ').trim(); base[k] = sum; tot += sum; if (/mm|cm/i.test(lab[k])) mm += sum;
      });
      return { n: nm, lab: lab, base: base, keys: Object.keys(lab), linear: LINEAR.test(nm), unit: mm > tot / 2 ? 'mm' : 'in' };
    });
  }
  function passes(d, r, skip) {
    for (var nm in sel) {
      if (nm === skip) continue;
      var m = d._m[nm]; if (!m) return false;
      var code = r[4 + m.idx]; if (code < 0 || !sel[nm][m.keys[code]]) return false;
    }
    for (var rn in rng) {
      if (!rangeActive(rng[rn])) continue;
      var mr = d._m[rn]; if (!mr) return false;
      var cd = r[4 + mr.idx]; if (cd < 0 || !rangeOK(mr.nums, cd, rng[rn])) return false;
    }
    return true;
  }
  function nodeCount(nd, cc) { var t = 0; nd.cats.forEach(function (c) { t += cc[c.id] || 0; }); nd.kids.forEach(function (k) { t += nodeCount(k, cc); }); return t; }
  function itemCats(it) { return it.cat ? [it.cat] : allCats(it.node); }
  function baseCats() {
    var ks = Object.keys(picked); if (!ks.length) return cats;
    var seen = {}, out = [];
    items().forEach(function (it) { if (picked[it.key]) itemCats(it).forEach(function (c) { if (!seen[c.id]) { seen[c.id] = 1; out.push(c); } }); });
    return out;
  }
  function scopeCats() { return baseCats().filter(function (c) { return !excl[c.id]; }); }
  function items() {
    var out = [];
    n.kids.forEach(function (k) { out.push({ key: 'g' + k.name, relKey: segs.concat([k.name]).join(' > '), name: k.name, img: k.img, imgs: allCats(k).slice().sort(function (p, q) { return q.n - p.n; }).filter(function (c) { return c.img; }).slice(0, 4).map(function (c) { return c.img; }), desc: '', node: k, link: href(segs.concat([k.name])), subs: k.kids.map(function (x) { return { name: x.name, n: x.n, href: href(segs.concat([k.name, x.name])) }; }).concat(k.cats.map(function (c) { return { name: c.name, n: c.n, href: '#/c/' + c.id }; })) }); });
    n.cats.forEach(function (c) { out.push({ key: 'c' + c.id, relKey: (c.path ? c.path + ' > ' : '') + c.name, name: c.name, img: c.img, imgs: [c.img], desc: c.desc, cat: c, link: '#/c/' + c.id, subs: [] }); });
    return out;
  }
  function toggle(nm, k) {
    if (sel[nm] && sel[nm][k]) { delete sel[nm][k]; if (!Object.keys(sel[nm]).length) delete sel[nm]; } else { (sel[nm] = sel[nm] || {})[k] = 1; }
    shown = PAGE; saveState(); draw();
  }
  function catLink(c) {
    var d = loaded[c.id]; if (!d || !d._m) return '#/c/' + c.id;
    var p = [];
    Object.keys(sel).forEach(function (nm) { var m = d._m[nm]; if (!m) return; var codes = []; m.keys.forEach(function (k, i) { if (sel[nm][k]) codes.push(i); }); if (codes.length) p.push('f' + m.idx + '=' + codes.join(',')); });
    Object.keys(rng).forEach(function (nm) { var m = d._m[nm]; if (m && rangeActive(rng[nm])) p.push('r' + m.idx + '=' + [rng[nm].min, rng[nm].max, rng[nm].unit].join('~')); });
    return '#/c/' + c.id + (p.length ? '?' + p.join('&') : '');
  }

  function draw() {
    var active = isActive(), cc = {}, total = 0, scope = scopeCats(), inScope = {};
    scope.forEach(function (c) { inScope[c.id] = 1; });
    if (attrs) cats.forEach(function (c) {
      var d = loaded[c.id], k = 0; if (!d) return;
      for (var i = 0; i < d.rows.length; i++) if (passes(d, d.rows[i], null)) k++;
      cc[c.id] = k; if (inScope[c.id]) total += k;
    });
    else { cats.forEach(function (c) { cc[c.id] = c.n; if (inScope[c.id]) total += c.n; }); }
    if (attrs && active && !Object.keys(picked).length) {   // only one category has matching parts -> open its page
      var live = cats.filter(function (c) { return cc[c.id] > 0; });
      if (live.length === 1) { location.hash = catLink(live[0]); return; }
    }
    /* ----- left panel ----- */
    var scroll = side.scrollTop; side.innerHTML = '';
    if (!canFilter) {
      side.appendChild($('h2', null, 'Choose a Category'));
      var lst = $('div', 'fb short'), fl = $('div', 'fl');
      n.kids.concat(n.cats).forEach(function (x) { var a = $('a', null, '<span>' + esc(x.name) + '</span><span class="n">' + fmt(x.n) + '</span>'); a.href = x.id ? '#/c/' + x.id : href(segs.concat([x.name])); fl.appendChild(a); });
      lst.appendChild(fl); side.appendChild(lst);
      side.appendChild($('div', 'fb', '<span style="color:#6b7280;font-size:12.5px">Open a sub-category to filter by attribute.</span>'));
    } else if (!attrs) {
      side.appendChild($('h2', null, 'Filter by')); side.appendChild($('div', 'fb', 'Loading attributes&hellip; (' + nLoaded + '/' + cats.length + ')'));
    } else {
      var h = $('h2', null, 'Filter by');
      if (active) { var cl = $('a', null, 'Clear all'); cl.href = '#'; cl.onclick = function (e) { e.preventDefault(); sel = {}; rng = {}; shown = PAGE; saveState(); draw(); }; h.appendChild(cl); }
      side.appendChild(h);
      attrs.forEach(function (a) {
        var counts = {};
        scope.forEach(function (c) {
          var d = loaded[c.id], m = d._m[a.n]; if (!m) return;
          for (var i = 0; i < d.rows.length; i++) { var r = d.rows[i], code = r[4 + m.idx]; if (code >= 0 && passes(d, r, a.n)) { var k = m.keys[code]; counts[k] = (counts[k] || 0) + 1; } }
        });
        facetBlock(side, {
          name: a.n, allKeys: a.keys, live: counts, base: a.base, label: function (k) { return a.lab[k] || k; },
          isSel: function (k) { return !!(sel[a.n] && sel[a.n][k]); }, toggle: function (k) { toggle(a.n, k); },
          search: search, open: openU, redraw: draw, linear: a.linear, range: rng[a.n], defUnit: a.unit,
          setRange: function (mi, ma, un) { if (mi === '' && ma === '') delete rng[a.n]; else rng[a.n] = { min: mi, max: ma, unit: un }; shown = PAGE; saveState(); draw(); }
        });
      });
    }
    side.scrollTop = scroll;
    /* ----- main: title, chips, cards, SKU list ----- */
    main.innerHTML = '';
    main.appendChild(titleBlock(parent, title));
    var meta = $('div', 'count', fmt(total) + ' Products' + (Object.keys(picked).length ? ' in ' + Object.keys(picked).length + ' selected categor' + (Object.keys(picked).length > 1 ? 'ies' : 'y') : ''));
    if (canFilter) { var jl = $('a', 'jump', 'View SKUs &darr;'); jl.href = '#'; jl.onclick = function (e) { e.preventDefault(); var t = document.getElementById('skus'); t && t.scrollIntoView({ behavior: 'smooth' }); }; meta.appendChild(jl); }
    main.appendChild(meta);
    if (active && attrs) {
      var chips = $('div', 'chips');
      Object.keys(sel).forEach(function (nm) {
        var a = attrs.filter(function (x) { return x.n === nm; })[0];
        Object.keys(sel[nm]).forEach(function (k) { var ch = $('span', 'chip', esc(nm) + ': ' + esc(a && a.lab[k] || k) + ' &times;'); ch.onclick = function () { toggle(nm, k); }; chips.appendChild(ch); });
      });
      Object.keys(rng).forEach(function (nm) {
        if (!rangeActive(rng[nm])) return; var r = rng[nm];
        var ch = $('span', 'chip', esc(nm) + ': ' + (r.min === '' ? '≤' : r.min + ' – ') + (r.max === '' ? '' : r.max) + ' ' + r.unit + ' &times;');
        ch.onclick = function () { delete rng[nm]; saveState(); draw(); }; chips.appendChild(ch);
      });
      main.appendChild(chips);
    }
    var grid = $('div', 'cards' + (canFilter && Object.keys(picked).length ? ' has-pick' : ''));
    var its = items(); its.forEach(function (it) { it.n = it.cat ? (cc[it.cat.id] || 0) : nodeCount(it.node, cc); });
    its.sort(function (a, b) { return b.n - a.n; });
    its.forEach(function (it) {
      if (active && attrs && !it.n) return;
      var card = $('div', 'card' + (picked[it.key] ? ' picked' : '')); card.dataset.k = it.key;
      var lab = $('button', 'info' + (info === it.key ? ' on' : ''), 'i'); lab.type = 'button'; lab.title = 'Show information';
      lab.onclick = function (e) {   // the "i" icon toggles the info panel (no checkbox)
        e.stopPropagation();
        var wasOpen = info === it.key;
        main.querySelectorAll('.info').forEach(function (x) { x.classList.remove('on'); });
        if (wasOpen) { info = null; closePanel(); }
        else { info = it.key; lab.classList.add('on'); openPanel(it, parent || (segs.length === 1 ? null : segs[0]), function () { info = null; main.querySelectorAll('.info').forEach(function (x) { x.classList.remove('on'); }); }); }
      };
      card.appendChild(lab);
      card.appendChild($('div', 'nm', esc(it.name)));
      card.appendChild(imgEl(it.img, it.name));
      var ft = $('div', 'ft'), nsub = it.node ? it.node.kids.filter(function (x) { return !attrs || nodeCount(x, cc) > 0; }).length + it.node.cats.filter(function (x) { return !attrs || (cc[x.id] || 0) > 0; }).length : 0;
      ft.appendChild($('span', 'ct', (nsub ? '<span>' + fmt(nsub) + ' Sub ' + (nsub === 1 ? 'Category' : 'Categories') + '</span>' : '') + '<span>' + fmt(it.n) + ' SKUs</span>'));
      var op = $('a', 'open', '&rsaquo;'); op.title = 'Open ' + it.name; op.href = it.cat ? catLink(it.cat) : it.link; op.onclick = function (e) { e.stopPropagation(); };
      ft.appendChild(op); card.appendChild(ft);
      card.onclick = function () {
        if (!canFilter) { location.hash = it.cat ? catLink(it.cat) : it.link; return; }
        if (picked[it.key]) delete picked[it.key]; else picked[it.key] = 1;
        excl = {}; shown = PAGE; saveState(); draw();
      };
      var imBox = card.querySelector('.im');   // only the image enlarges (0.2 s delay + 2x are in CSS); card text/footer stay put
      imBox.onmouseenter = function () {
        var cr = imBox.getBoundingClientRect(), mr = main.getBoundingClientRect();
        var ox = cr.left - mr.left < cr.width / 2 ? '0%' : (mr.right - cr.right < cr.width / 2 ? '100%' : '50%');
        imBox.style.setProperty('--ox', ox); imBox.style.setProperty('--oy', cr.top < 260 ? '0%' : '50%');
        card.style.zIndex = 40;
      };
      imBox.onmouseleave = function () { card.style.zIndex = ''; };
      grid.appendChild(card);
    });
    main.appendChild(grid);
    if (!grid.children.length) main.appendChild($('div', 'empty', 'No categories match these filters.'));
    var rsn = relSection(segs.join(' > ')); if (rsn) main.appendChild(rsn);
    /* SKU list for the highlighted categories (all categories if none highlighted) */
    if (canFilter && attrs) {
      var sk = $('section', 'skus'); sk.id = 'skus';
      sk.appendChild($('h2', null, 'SKUs <span class="n">' + fmt(total) + '</span>'));
      var colNames = COLS.filter(function (c) { return attrs.some(function (a) { return a.n === c; }); }).slice(0, 4);
      var res = [];
      scope.forEach(function (c) { var d = loaded[c.id]; for (var i = 0; i < d.rows.length; i++) if (passes(d, d.rows[i], null)) res.push([d, d.rows[i], c]); });
      if (!res.length) sk.appendChild($('div', 'empty', 'No products match.'));
      else {
        var t = $('table', 'tbl'), tr = $('tr'); tr.appendChild($('th')); ['Part #', 'Description', 'Category'].concat(colNames).forEach(function (x) {
          var th = $('th', null, esc(x));
          if (x === 'Category') {
            var bc = baseCats().filter(function (c) { return cc[c.id] > 0 || excl[c.id]; }).sort(function (p, q) { return (cc[q.id] || 0) - (cc[p.id] || 0); });
            var nOn = bc.filter(function (c) { return !excl[c.id]; }).length;
            th.className = 'catth'; th.innerHTML = esc(x) + ' <button class="catbtn" title="Choose categories to show">' + nOn + '/' + bc.length + ' &#9662;</button>';
            var btn = th.querySelector('button');
            btn.onclick = function (e) { e.stopPropagation(); catMenu = !catMenu; draw(); };
            if (catMenu) {
              var mn = $('div', 'catmenu'); mn.onclick = function (e) { e.stopPropagation(); };
              var top = $('div', 'cmtop'); var all = $('a', null, 'Select all'), none = $('a', null, 'Clear');
              all.href = none.href = '#'; all.onclick = function (e) { e.preventDefault(); excl = {}; shown = PAGE; saveState(); draw(); };
              none.onclick = function (e) { e.preventDefault(); bc.forEach(function (c) { excl[c.id] = 1; }); shown = PAGE; saveState(); draw(); };
              top.appendChild(all); top.appendChild(none); mn.appendChild(top);
              bc.forEach(function (c) {
                var lb = $('label'), ck = $('input'); ck.type = 'checkbox'; ck.checked = !excl[c.id];
                ck.onchange = function () { if (ck.checked) delete excl[c.id]; else excl[c.id] = 1; shown = PAGE; saveState(); draw(); };
                lb.appendChild(ck); lb.appendChild($('span', null, esc(c.name))); lb.appendChild($('span', 'n', fmt(cc[c.id] || 0))); mn.appendChild(lb);
              });
              th.appendChild(mn);
              if (closeH) document.removeEventListener('click', closeH);
              closeH = function () { catMenu = false; document.removeEventListener('click', closeH); closeH = null; draw(); };
              setTimeout(function () { if (closeH) document.addEventListener('click', closeH); }, 0);
            }
          }
          tr.appendChild(th);
        });
        var th = $('thead'); th.appendChild(tr); t.appendChild(th);
        var tb = $('tbody');
        res.slice(0, shown).forEach(function (e) {
          var d = e[0], r = e[1], row = $('tr', 'r'), td = $('td', 'th');
          if (r[2]) { var im = $('img'); im.loading = 'lazy'; im.src = img(r[2]); im.alt = ''; im.onerror = function () { im.style.display = 'none'; }; td.appendChild(im); }
          row.appendChild(td);
          row.appendChild($('td', 'pn', '<a href="' + shopUrl(r[0]) + '" target="_blank" rel="noopener" title="Open in the SBS web shop">' + esc(r[0]) + ' ' + EXT + '</a>'));
          row.appendChild($('td', null, esc(r[1])));
          row.appendChild($('td', null, '<a href="' + catLink(e[2]) + '">' + esc(e[2].name) + '</a>'));
          colNames.forEach(function (cn) { var m = d._m[cn], code = m ? r[4 + m.idx] : -1; row.appendChild($('td', null, code >= 0 ? esc(d.filters[m.idx].v[code]) : '&ndash;')); });
          tb.appendChild(row);
        });
        t.appendChild(tb); sk.appendChild(t);
        if (res.length > shown) { var mo = $('button', 'more', 'Show more (' + fmt(res.length - shown) + ' remaining)'); mo.onclick = function () { shown += PAGE * 2; draw(); }; sk.appendChild(mo); }
      }
      main.appendChild(sk);
    }
  }
  draw(); window.scrollTo(0, 0);
  if (canFilter) cats.forEach(function (c) {
    loadCat(c.id, function (d) { if (tok !== SBS._tok) return; loaded[c.id] = d; nLoaded++; if (nLoaded === cats.length) prepare(); if (nLoaded === cats.length || nLoaded % 4 === 0) draw(); });
  });
}

/* ---------- category page: filters + spec table ---------- */
function showCat(id, qs) {
  app.innerHTML = '<div class="loading">Loading&hellip;</div>';
  loadCat(id, function (c) {
    if (!c) { app.innerHTML = '<div class="empty">Category not found.</div>'; return; }
    var segs = (c.path || '').split(' > ').filter(Boolean);
    setCrumbs(groupCrumbs(segs, true).concat([{ t: c.name }]));
    document.title = c.name + ' | SBS Catalog';
    renderCat(c, qs, segs);
  });
}
function catHeader(c, segs) {
  var ent = catIndex()[c.id] || {}, parent = segs.length ? segs[0] : null, open = false;
  var hd = $('div', 'cathead'), left = $('div', 'ctitle');
  if (parent) left.appendChild($('div', 'parent', esc(parent)));
  var row = $('div', 'trow'); row.appendChild($('h1', null, esc(c.name)));
  var ib = $('button', 'info ih', 'i'); ib.type = 'button'; ib.title = 'Show information';
  ib.onclick = function () {
    open = !open; ib.classList.toggle('on', open);
    if (open) openPanel({ name: c.name, imgs: [ent.img], subs: [], relKey: (c.path ? c.path + ' > ' : '') + c.name }, parent, function () { open = false; ib.classList.remove('on'); });
    else closePanel();
  };
  row.appendChild(ib); left.appendChild(row); hd.appendChild(left);
  hd.appendChild(imgEl(ent.img, c.name));
  var d = $('div', 'cd'); LOREM.forEach(function (t) { d.appendChild($('p', null, t)); }); hd.appendChild(d);
  return hd;
}
function renderCat(c, qs, segs) {
  var q = parseQS(qs), sel = {}, rng = {}, F = c.filters, openU = {}, search = {};
  F.forEach(function (f, i) {
    f.nums = LINEAR.test(f.n) ? f.v.map(parseLen) : null;
    if (q['f' + i]) { sel[i] = {}; q['f' + i].split(',').forEach(function (v) { sel[i][v] = 1; }); }
    if (q['r' + i]) { var p = q['r' + i].split('~'); rng[i] = { min: p[0] === '' ? '' : +p[0], max: p[1] === '' ? '' : +p[1], unit: p[2] || 'in' }; }
  });
  var sortCol = q.s != null && q.s !== '' ? q.s : null, sortDir = q.d === '1' ? -1 : 1, shown = PAGE, rows = c.rows;
  var base = F.map(function () { return {}; }), defUnit = F.map(function () { return 'in'; });
  rows.forEach(function (r) { F.forEach(function (f, i) { var v = r[4 + i]; if (v >= 0) base[i][v] = (base[i][v] || 0) + 1; }); });
  F.forEach(function (f, i) { var mm = 0, tot = 0; Object.keys(base[i]).forEach(function (k) { tot += base[i][k]; if (/mm|cm/i.test(f.v[k])) mm += base[i][k]; }); if (mm > tot / 2) defUnit[i] = 'mm'; });

  function passes(r, skip) {
    for (var i in sel) { if (+i === skip) continue; if (!sel[i][r[4 + +i]]) return false; }
    for (var j in rng) { if (!rangeActive(rng[j])) continue; var v = r[4 + +j]; if (v < 0 || !rangeOK(F[j].nums, v, rng[j])) return false; }
    return true;
  }
  function url() {
    var p = [];
    for (var i in sel) { var k = Object.keys(sel[i]); if (k.length) p.push('f' + i + '=' + k.join(',')); }
    for (var j in rng) if (rangeActive(rng[j])) p.push('r' + j + '=' + [rng[j].min, rng[j].max, rng[j].unit].join('~'));
    if (sortCol != null) { p.push('s=' + sortCol); if (sortDir < 0) p.push('d=1'); }
    return '#/c/' + c.id + (p.length ? '?' + p.join('&') : '');
  }
  function go() { shown = PAGE; history.replaceState(null, '', url()); draw(); }
  function isActive() { return Object.keys(sel).length > 0 || Object.keys(rng).some(function (k) { return rangeActive(rng[k]); }); }

  var wrap = $('div', 'layout'), side = $('aside', 'filters'), main = $('div', 'main');
  wrap.appendChild(side); wrap.appendChild(main);
  app.innerHTML = ''; app.appendChild(catHeader(c, segs));
  var rs = relSection(((c.path ? c.path + ' > ' : '') + c.name)); if (rs) app.appendChild(rs);
  app.appendChild(wrap);

  function draw() {
    var scroll = side.scrollTop, active = isActive();
    side.innerHTML = '';
    var h = $('h2', null, 'Filter by');
    if (active) { var cl = $('a', null, 'Clear all'); cl.href = '#'; cl.onclick = function (e) { e.preventDefault(); sel = {}; rng = {}; go(); }; h.appendChild(cl); }
    side.appendChild(h);
    var order = F.map(function (f, i) { return i; }).sort(function (x, y) { var px = PREF.indexOf(F[x].n), py = PREF.indexOf(F[y].n); if (px < 0) px = 99; if (py < 0) py = 99; return px - py || x - y; });
    order.forEach(function (i) {
      var f = F[i], counts = {};
      for (var k = 0; k < rows.length; k++) { var r = rows[k]; if (passes(r, i)) { var v = r[4 + i]; if (v >= 0) counts[v] = (counts[v] || 0) + 1; } }
      var all = f.v.map(function (_, vi) { return vi; });
      facetBlock(side, {
        name: f.n, allKeys: all, live: counts, base: base[i], label: function (vi) { return f.v[vi]; },
        isSel: function (vi) { return !!(sel[i] && sel[i][vi]); },
        toggle: function (vi) { sel[i] = sel[i] || {}; if (sel[i][vi]) delete sel[i][vi]; else sel[i][vi] = 1; if (!Object.keys(sel[i]).length) delete sel[i]; go(); },
        search: search, open: openU, redraw: draw, linear: !!f.nums, range: rng[i], defUnit: defUnit[i],
        setRange: function (mi, ma, un) { if (mi === '' && ma === '') delete rng[i]; else rng[i] = { min: mi, max: ma, unit: un }; go(); }
      });
    });
    side.scrollTop = scroll;

    var res = rows.filter(function (r) { return passes(r, -1); });
    if (sortCol != null) {
      var ci = sortCol === 'pn' ? -1 : sortCol === 'ds' ? -2 : +sortCol;
      res = res.slice().sort(function (a, b) {
        var x = ci === -1 ? a[0] : ci === -2 ? a[1] : (a[4 + ci] >= 0 ? F[ci].v[a[4 + ci]] : '~~~'),
            y = ci === -1 ? b[0] : ci === -2 ? b[1] : (b[4 + ci] >= 0 ? F[ci].v[b[4 + ci]] : '~~~');
        return natCmp(x, y) * sortDir;
      });
    }
    main.innerHTML = '';
    if (active) {
      var chips = $('div', 'chips');
      Object.keys(sel).forEach(function (i) { Object.keys(sel[i]).forEach(function (vi) {
        var ch = $('span', 'chip', esc(F[i].n) + ': ' + esc(F[i].v[vi]) + ' &times;');
        ch.onclick = function () { delete sel[i][vi]; if (!Object.keys(sel[i]).length) delete sel[i]; go(); }; chips.appendChild(ch);
      }); });
      Object.keys(rng).forEach(function (i) {
        if (!rangeActive(rng[i])) return; var r = rng[i];
        var ch = $('span', 'chip', esc(F[i].n) + ': ' + (r.min === '' ? '≤' : r.min + ' – ') + (r.max === '' ? '' : r.max) + ' ' + r.unit + ' &times;');
        ch.onclick = function () { delete rng[i]; go(); }; chips.appendChild(ch);
      });
      main.appendChild(chips);
    }
    main.appendChild($('div', 'count', fmt(res.length) + ' of ' + fmt(rows.length) + ' products'));
    if (!res.length) { main.appendChild($('div', 'empty', 'No products match these filters.')); return; }
    var t = $('table', 'tbl'), thead = $('thead'), tr = $('tr');
    function th(label, key) {
      var e = $('th', null, esc(label) + (sortCol === key ? (sortDir > 0 ? ' &#9650;' : ' &#9660;') : ''));
      e.onclick = function () { if (sortCol === key) { if (sortDir > 0) sortDir = -1; else { sortCol = null; sortDir = 1; } } else { sortCol = key; sortDir = 1; } go(); };
      return e;
    }
    tr.appendChild($('th')); tr.appendChild(th('Part #', 'pn')); tr.appendChild(th('Description', 'ds'));
    c.cols.forEach(function (ci) { tr.appendChild(th(F[ci].n, String(ci))); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = $('tbody');
    res.slice(0, shown).forEach(function (r) {
      var row = $('tr', 'r'), td = $('td', 'th');
      if (r[2]) { var im = $('img'); im.loading = 'lazy'; im.src = img(r[2]); im.alt = ''; im.onerror = function () { im.style.display = 'none'; }; td.appendChild(im); }
      row.appendChild(td); row.appendChild($('td', 'pn', esc(r[0]))); row.appendChild($('td', null, esc(r[1])));
      c.cols.forEach(function (ci) { row.appendChild($('td', null, r[4 + ci] >= 0 ? esc(F[ci].v[r[4 + ci]]) : '&ndash;')); });
      var detail = null;
      row.onclick = function () {
        if (detail) { detail.remove(); detail = null; return; }
        detail = $('tr', 'd'); var dtd = $('td'); dtd.colSpan = 3 + c.cols.length;
        var d = $('div', 'det');
        if (r[2]) { var big = $('img'); big.src = img(r[2]); big.alt = ''; d.appendChild(big); }
        var dl = $('dl');
        F.forEach(function (f, i) { if (r[4 + i] >= 0) dl.innerHTML += '<dt>' + esc(f.n) + '</dt><dd>' + esc(f.v[r[4 + i]]) + '</dd>'; });
        var info = $('div'); info.appendChild($('h3', null, esc(r[0]))); info.appendChild($('div', null, esc(r[1]))); info.appendChild($('br')); info.appendChild(dl);
        (r[3] || []).forEach(function (dc) { info.appendChild($('div', null, '<a href="' + esc(dc[1]) + '" target="_blank" rel="noopener">' + esc(dc[0]) + '</a>')); });
        var bt = $('a', 'btn', 'View on shop.specialtybolt.com'); bt.href = shopUrl(r[0]); bt.target = '_blank'; bt.rel = 'noopener'; bt.onclick = function (e) { e.stopPropagation(); };
        info.appendChild(bt); d.appendChild(info); dtd.appendChild(d); detail.appendChild(dtd); row.after(detail);
      };
      tb.appendChild(row);
    });
    t.appendChild(tb); main.appendChild(t);
    if (res.length > shown) { var m = $('button', 'more', 'Show more (' + fmt(res.length - shown) + ' remaining)'); m.onclick = function () { shown += PAGE * 2; draw(); }; main.appendChild(m); }
  }
  draw(); window.scrollTo(0, 0);
}

/* ---------- search ---------- */
function showSearch(term) {
  setCrumbs([{ t: 'All Categories', href: '#/' }, { t: 'Search: ' + term }]);
  document.title = 'Search: ' + term + ' | SBS Catalog';
  app.innerHTML = '<div class="loading">Searching 100,000+ parts&hellip;</div>';
  loadSearch(function (err) {
    if (err) { app.innerHTML = '<div class="empty">Search data failed to load.</div>'; return; }
    var toks = term.toLowerCase().split(/\s+/).filter(Boolean).map(function (t) { return t.length > 3 ? t.replace(/(es|s)$/, '') : t; }), out = [], idx = SBS.IDX, ci = catIndex(), exact = term.toLowerCase();
    for (var i = 0; i < idx.length && out.length < 3000; i++) {
      var hay = (idx[i][0] + ' ' + idx[i][1] + ' ' + (idx[i][2] && ci[idx[i][2]] ? ci[idx[i][2]].name : '')).toLowerCase(), ok = true;
      for (var j = 0; j < toks.length; j++) if (hay.indexOf(toks[j]) < 0) { ok = false; break; }
      if (ok) out.push(idx[i]);
    }
    out.sort(function (a, b) {
      var A = a[0].toLowerCase(), B = b[0].toLowerCase();
      return (A === exact ? 0 : A.indexOf(exact) === 0 ? 1 : 2) - (B === exact ? 0 : B.indexOf(exact) === 0 ? 1 : 2) || natCmp(A, B);
    });
    app.innerHTML = ''; app.appendChild($('h1', null, 'Search results'));
    var cm = Object.keys(ci).map(function (k) { return ci[k]; }).filter(function (c) { var nm = c.name.toLowerCase(); return toks.every(function (t) { return nm.indexOf(t) >= 0; }); });
    if (cm.length) {
      app.appendChild($('div', 'sect', 'Matching categories'));
      var cg = $('div', 'cards small');
      cm.sort(function (a, b) { return b.n - a.n; }).slice(0, 12).forEach(function (c) {
        var a = $('a', 'card'); a.href = '#/c/' + c.id; a.appendChild(imgEl(c.img, c.name));
        var b = $('div', 'cb'); b.appendChild($('div', 'nm', esc(c.name))); if (c.desc) b.appendChild($('div', 'ds', esc(c.desc))); b.appendChild($('div', 'ct', fmt(c.n) + ' products')); a.appendChild(b); cg.appendChild(a);
      });
      app.appendChild(cg);
    }
    app.appendChild($('div', 'count', (out.length >= 3000 ? '3,000+' : fmt(out.length)) + ' parts match &ldquo;' + esc(term) + '&rdquo;'));
    if (!out.length) { app.appendChild($('div', 'empty', 'No parts found. Try fewer words or part of the part number.')); return; }
    var t = $('table', 'tbl'); t.innerHTML = '<thead><tr><th>Part #</th><th>Description</th><th>Category</th><th></th></tr></thead>';
    var tb = $('tbody'), shown = 200;
    function more() {
      out.slice(tb.children.length, shown).forEach(function (r) {
        var c = r[2] && ci[r[2]], row = $('tr', 'r');
        row.innerHTML = '<td class="pn"><a href="' + shopUrl(r[0]) + '" target="_blank" rel="noopener" title="Open in the SBS web shop">' + esc(r[0]) + ' ' + EXT + '</a></td><td>' + esc(r[1]) + '</td><td>' + (c ? '<a href="#/c/' + c.id + '">' + esc(c.name) + '</a>' : '<span style="color:#999">Not yet categorized</span>') + '</td><td><a href="' + shopUrl(r[0]) + '" target="_blank" rel="noopener">Shop &rsaquo;</a></td>';
        tb.appendChild(row);
      });
    }
    more(); t.appendChild(tb); app.appendChild(t);
    if (out.length > shown) { var b = $('button', 'more', 'Show more'); b.onclick = function () { shown += 300; more(); if (shown >= out.length) b.remove(); }; app.appendChild(b); }
    window.scrollTo(0, 0);
  });
}

/* ---------- sticky offsets (header + breadcrumb stay visible while scrolling) ---------- */
function setSticky() {
  var hd = document.getElementById('top'), hh = hd ? hd.offsetHeight : 68, ch = crumbs.offsetHeight;
  var r = document.documentElement.style; r.setProperty('--hh', hh + 'px'); r.setProperty('--st', (hh + ch) + 'px');
}
window.addEventListener('resize', setSticky);

/* ---------- router ---------- */
function route() {
  SBS._tok = (SBS._tok || 0) + 1; closePanel();
  var h = location.hash.replace(/^#\/?/, ''), qi = h.indexOf('?'), qs = '';
  if (qi >= 0) { qs = h.slice(qi + 1); h = h.slice(0, qi); }
  var p = h.split('/').filter(Boolean).map(decodeURIComponent);
  if (p[0] === 'c' && p[1]) return showCat(p[1], qs);
  if (p[0] === 'g' && p.length > 1) return showNode(p.slice(1), qs);
  if (p[0] === 's') return showSearch(p.slice(1).join('/'));
  showHome();
}
document.getElementById('searchForm').onsubmit = function (e) {
  e.preventDefault(); var v = qIn.value.trim(); if (v) location.hash = '#/s/' + encodeURIComponent(v);
};
document.addEventListener('keydown', function (e) {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); qIn.focus(); }
});
/* every external hyperlink (shop part pages, guides, standards, documents, shop home) opens in a new tab */
document.addEventListener('click', function (e) {
  var el = e.target.closest ? e.target.closest('a[href]') : null; if (!el) return;
  var h = el.getAttribute('href') || '';
  if (/^https?:\/\//i.test(h) && h.indexOf(location.origin) !== 0) { e.preventDefault(); e.stopPropagation(); window.open(h, '_blank', 'noopener'); }
}, true);
window.addEventListener('hashchange', function () { route(); setSticky(); });
function start() {
  document.getElementById('stats').textContent = fmt(SBS.TREE.n) + ' browsable parts';
  route(); setSticky(); setTimeout(setSticky, 400);
}
if (SBS.TREE) start(); else SBS._treeCb = start;
})();
