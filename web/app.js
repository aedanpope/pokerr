// ---------------------------------------------------------------------------
// Data — loaded via fetch from query param ?data=... or default
// ---------------------------------------------------------------------------

let DATA = null;

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function rangeClass(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('raise') && n.includes('bluff')) return 'action-raise-bluff';
  if (n.includes('raise'))  return 'action-raise-value';
  if (n.includes('call'))   return 'action-call';
  if (n.includes('fold'))   return 'action-fold';
  return 'action-unknown';
}

function getTopLevel(name) {
  return DATA.tree.find(n => n.name === name);
}

function copyCode(el) {
  const text = el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    el.classList.add('copied');
    el.textContent = 'Copied!';
    setTimeout(() => { el.textContent = text; el.classList.remove('copied'); }, 1000);
  });
}

function makeLegend() {
  const div = document.createElement('div');
  div.className = 'legend';
  Object.values(DATA.rangeMeta).forEach(m => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const sw = document.createElement('div');
    sw.className = 'legend-swatch ' + rangeClass(m.name);
    const nm = document.createElement('span');
    nm.textContent = m.name;
    item.appendChild(sw);
    item.appendChild(nm);
    div.appendChild(item);
  });
  return div;
}

function makeRangeRows(tab) {
  const frag = document.createDocumentFragment();
  (tab.ranges || []).forEach(r => {
    if (!r.hands.length) return;
    const meta = DATA.rangeMeta[r.id] || { name: r.id };
    const row = document.createElement('div');
    row.className = 'range-row';
    const lbl = document.createElement('span');
    lbl.className = 'range-label ' + rangeClass(meta.name);
    lbl.textContent = meta.name;
    const code = document.createElement('code');
    code.className = 'range-value';
    code.textContent = r.hands.join(',') + '::{}';
    code.title = 'Click to copy';
    code.addEventListener('click', () => copyCode(code));
    row.appendChild(lbl);
    row.appendChild(code);
    frag.appendChild(row);
  });
  return frag;
}

// ---------------------------------------------------------------------------
// Range grid (13×13 hand matrix)
// ---------------------------------------------------------------------------

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];

function cellToHand(i, j) {
  if (i === j) return RANKS[i] + RANKS[i];          // pair
  if (i < j)   return RANKS[i] + RANKS[j] + 's';   // suited  (upper triangle)
  return             RANKS[j] + RANKS[i] + 'o';     // offsuit (lower triangle)
}

function buildHandMap(tab) {
  const map = {};
  (tab.ranges || []).forEach(r => {
    const meta = DATA.rangeMeta[r.id] || { name: r.id };
    r.hands.forEach(h => { map[h] = meta; });
  });
  return map;
}

function makeRangeGrid(tab) {
  const handMap = buildHandMap(tab);

  const wrap = document.createElement('div');
  wrap.className = 'range-grid-wrap';

  const grid = document.createElement('div');
  grid.className = 'range-grid';

  RANKS.forEach((_, i) => {
    RANKS.forEach((_, j) => {
      const hand = cellToHand(i, j);
      const meta = handMap[hand];
      const cell = document.createElement('div');
      cell.className = 'grid-cell' + (meta ? ' in-range' : '');
      cell.textContent = hand;
if (meta) cell.classList.add(rangeClass(meta.name));
      grid.appendChild(cell);
    });
  });

  wrap.appendChild(grid);

  // Mini legend — only ranges present in this tab
  const seen = new Map();
  (tab.ranges || []).forEach(r => {
    if (r.hands.length > 0 && !seen.has(r.id)) {
      seen.set(r.id, DATA.rangeMeta[r.id] || { name: r.id });
    }
  });
  if (seen.size > 0) {
    const legend = document.createElement('div');
    legend.className = 'grid-mini-legend';
    seen.forEach(meta => {
      const item = document.createElement('div');
      item.className = 'grid-mini-legend-item';
      const sw = document.createElement('div');
      sw.className = 'grid-mini-swatch ' + rangeClass(meta.name);
      const nm = document.createElement('span');
      nm.textContent = meta.name;
      item.appendChild(sw);
      item.appendChild(nm);
      legend.appendChild(item);
    });
    wrap.appendChild(legend);
  }

  return wrap;
}

function makeRangeDisplay(tab) {
  const div = document.createElement('div');
  div.appendChild(makeRangeGrid(tab));
  const textRows = document.createElement('div');
  textRows.className = 'range-text-rows';
  textRows.appendChild(makeRangeRows(tab));
  div.appendChild(textRows);
  return div;
}

// ---------------------------------------------------------------------------
// Tree view
// ---------------------------------------------------------------------------

function buildTree(nodes, depth) {
  const ul = document.createElement('div');
  ul.className = 'tree-children' + (depth === 0 ? ' open' : '');
  nodes.forEach(node => {
    const item = document.createElement('div');
    item.className = 'tree-node';
    const hdr = document.createElement('div');
    hdr.className = 'tree-node-header';
    hdr.style.paddingLeft = (0.6 + depth * 1.1) + 'rem';
    const chev = document.createElement('span');
    chev.className = 'chevron' + (depth === 0 ? ' open' : '');
    const icon = document.createElement('span');
    icon.className = 'node-icon';
    const lbl = document.createElement('span');
    lbl.className = 'node-label';
    lbl.textContent = node.name;

    if (node.type === 'tab') {
      chev.textContent = '';
      icon.textContent = '📋';
      hdr.addEventListener('click', () => {
        document.querySelectorAll('.tree-node-header').forEach(h => h.classList.remove('active'));
        hdr.classList.add('active');
        renderTreeTab(node);
      });
    } else {
      chev.textContent = '▶';
      icon.textContent = node.type === 'folder' ? '📁' : '📂';
      const kids = buildTree(node.children, depth + 1);
      item.appendChild(kids);
      hdr.addEventListener('click', () => {
        const open = kids.classList.toggle('open');
        chev.classList.toggle('open', open);
        if (node.type === 'category') {
          document.querySelectorAll('.tree-node-header').forEach(h => h.classList.remove('active'));
          hdr.classList.add('active');
          renderTreeCategory(node);
        }
      });
      if (depth === 0) { kids.classList.add('open'); chev.classList.add('open'); }
    }
    hdr.appendChild(chev); hdr.appendChild(icon); hdr.appendChild(lbl);
    item.insertBefore(hdr, item.firstChild);
    ul.appendChild(item);
  });
  return ul;
}

function renderTreeTab(tab) {
  const panel = document.getElementById('content-panel');
  panel.innerHTML = '';
  const h2 = document.createElement('h2');
  h2.textContent = tab.name;
  panel.appendChild(h2);
  panel.appendChild(makeRangeDisplay(tab));
}

function renderTreeCategory(cat) {
  const panel = document.getElementById('content-panel');
  panel.innerHTML = '';
  const h2 = document.createElement('h2');
  h2.textContent = cat.name;
  panel.appendChild(h2);
  panel.appendChild(makeLegend());
  cat.children.forEach(tab => {
    const block = document.createElement('div');
    block.className = 'tab-block';
    const h3 = document.createElement('h3');
    h3.textContent = tab.name;
    block.appendChild(h3);
    block.appendChild(makeRangeDisplay(tab));
    panel.appendChild(block);
  });
}

// ---------------------------------------------------------------------------
// Hand Builder — data queries
// ---------------------------------------------------------------------------

function getStep2Options(rfiName) {
  const facingNode = getTopLevel('Facing RFI');
  if (!facingNode) return [];
  const kw = rfiName.toLowerCase();
  const results = [];
  (facingNode.children || []).forEach(subcat => {
    (subcat.children || []).forEach(tab => {
      if (tab.type !== 'tab') return;
      let label, facingPos;
      if (subcat.name === 'EP/MP') {
        const parts = tab.name.toLowerCase().split(/\s+vs\s+/);
        if (parts.length < 2 || !parts[1].includes(kw)) return;
        label = tab.name;
        const facerPart = tab.name.split(/\s+vs\s+/i)[0].trim();
        facingPos = facerPart.split(/[\s/]+/).pop();
      } else {
        if (!tab.name.toLowerCase().includes(kw)) return;
        label = `${subcat.name} ${tab.name}`;
        facingPos = subcat.name;
      }
      results.push({ tab, label, facingPos });
    });
  });
  return results;
}

function getStep3Options(rfiName, facingPos) {
  const vs3betNode = getTopLevel('RFI vs 3bet');
  if (!vs3betNode) return [];
  const rn = rfiName.toLowerCase();
  const fp = facingPos.toLowerCase();
  const raiserCat = (vs3betNode.children || []).find(c => {
    const cn = c.name.toLowerCase();
    return cn === rn || cn.includes(rn) || rn.includes(cn);
  });
  if (!raiserCat) return [];
  return (raiserCat.children || [])
    .filter(t => t.type === 'tab' && t.name.toLowerCase().includes(fp))
    .map(t => ({ tab: t, label: t.name }));
}

// ---------------------------------------------------------------------------
// Hand Builder — rendering
// ---------------------------------------------------------------------------

const builder = { rfiTab: null, facingTab: null, facingPos: null, vs3betTab: null };

function makeBuilderStep(title, options, selectedTab, onSelect) {
  const card = document.createElement('div');
  card.className = 'builder-step';

  const hdr = document.createElement('div');
  hdr.className = 'builder-step-header';
  hdr.textContent = title;
  card.appendChild(hdr);

  const body = document.createElement('div');
  body.className = 'builder-step-body';

  if (options.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'builder-empty';
    msg.textContent = 'No matching ranges found.';
    body.appendChild(msg);
  } else {
    const chips = document.createElement('div');
    chips.className = 'builder-chips';
    options.forEach(opt => {
      const chip = document.createElement('div');
      chip.className = 'builder-chip' + (selectedTab === opt.tab ? ' selected' : '');
      chip.textContent = opt.label;
      chip.addEventListener('click', () => onSelect(opt));
      chips.appendChild(chip);
    });
    body.appendChild(chips);

    if (selectedTab) {
      const rd = document.createElement('div');
      rd.className = 'builder-ranges';
      rd.appendChild(makeRangeDisplay(selectedTab));
      body.appendChild(rd);
    }
  }

  card.appendChild(body);
  return card;
}

function renderBuilder() {
  const view = document.getElementById('builder-view');
  view.innerHTML = '';

  const rfiNode = getTopLevel('RFI');
  if (!rfiNode) {
    view.innerHTML = '<p class="placeholder">No RFI category found in data.</p>';
    return;
  }

  const arrow = () => {
    const d = document.createElement('div');
    d.className = 'builder-arrow';
    d.textContent = '↓';
    return d;
  };

  view.appendChild(makeBuilderStep(
    '1  Open-raise position',
    rfiNode.children.map(t => ({ tab: t, label: t.name })),
    builder.rfiTab,
    opt => {
      builder.rfiTab = opt.tab;
      builder.facingTab = null; builder.facingPos = null; builder.vs3betTab = null;
      renderBuilder();
    }
  ));

  if (!builder.rfiTab) return;

  view.appendChild(arrow());
  view.appendChild(makeBuilderStep(
    `2  Facing position  (vs ${builder.rfiTab.name} open)`,
    getStep2Options(builder.rfiTab.name),
    builder.facingTab,
    opt => {
      builder.facingTab = opt.tab; builder.facingPos = opt.facingPos; builder.vs3betTab = null;
      renderBuilder();
    }
  ));

  if (!builder.facingTab) return;

  const step3 = getStep3Options(builder.rfiTab.name, builder.facingPos);
  if (step3.length > 0) {
    view.appendChild(arrow());
    view.appendChild(makeBuilderStep(
      `3  ${builder.rfiTab.name} vs ${builder.facingPos} 3-bet`,
      step3,
      builder.vs3betTab,
      opt => { builder.vs3betTab = opt.tab; renderBuilder(); }
    ));
  }
}

// ---------------------------------------------------------------------------
// Quiz mode
// ---------------------------------------------------------------------------

const ALL_HANDS = (() => {
  const hands = [];
  const r = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
  for (let i = 0; i < 13; i++) {
    hands.push(r[i] + r[i]);
    for (let j = i + 1; j < 13; j++) {
      hands.push(r[i] + r[j] + 's');
      hands.push(r[i] + r[j] + 'o');
    }
  }
  return hands;
})();

// Position names match tab data exactly; coords are SVG units in viewBox "-5 -5 270 175"
const SEAT_POS = {
  'BTN': { x: 130, y: 152 },
  'CO':  { x: 196, y: 132 },
  'HJ':  { x: 223, y: 82  },
  'LJ':  { x: 199, y: 30  },
  '+2':  { x: 155, y: 12  },
  '+1':  { x: 105, y: 12  },
  'UTG': { x: 61,  y: 30  },
  'SB':  { x: 37,  y: 82  },
  'BB':  { x: 64,  y: 132 },
};

function buildQuizScenarios() {
  const scenarios = [];

  // RFI scenarios — hero decides to open or fold
  const rfiNode = getTopLevel('RFI');
  if (rfiNode) {
    (rfiNode.children || []).forEach(cat => {
      (cat.children || []).forEach(tab => {
        if (tab.type !== 'tab') return;
        const heroPos = cat.name;
        if (!SEAT_POS[heroPos]) return;
        scenarios.push({ tab, heroPos, raiserPos: null, type: 'rfi' });
      });
    });
  }

  // Facing-RFI scenarios — hero decides to 3-bet, call, or fold
  const facingNode = getTopLevel('Facing RFI');
  if (facingNode) {
    (facingNode.children || []).forEach(subcat => {
      (subcat.children || []).forEach(tab => {
        if (tab.type !== 'tab') return;
        let heroPos, raiserPos;
        if (subcat.name === 'EP/MP') {
          const parts = tab.name.split(/\s+vs\s+/i);
          if (parts.length < 2) return;
          heroPos = parts[0].trim();
          raiserPos = parts[1].trim();
        } else {
          const match = tab.name.match(/vs\s+(.+)/i);
          if (!match) return;
          heroPos = subcat.name;
          raiserPos = match[1].trim();
        }
        // Expand combined positions like "UTG/+1" → ["UTG", "+1"]
        const heroPoses   = heroPos.split('/').map(p => p.trim());
        const raiserPoses = raiserPos.split('/').map(p => p.trim());
        heroPoses.forEach(hp => {
          raiserPoses.forEach(rp => {
            if (hp === rp) return;
            if (!SEAT_POS[hp] || !SEAT_POS[rp]) return;
            scenarios.push({ tab, heroPos: hp, raiserPos: rp, type: 'facing' });
          });
        });
      });
    });
  }

  // RFI vs 3bet scenarios — hero decides to 4-bet, call, or fold
  const vs3betNode = getTopLevel('RFI vs 3bet');
  if (vs3betNode) {
    (vs3betNode.children || []).forEach(cat => {
      const heroPos = cat.name; // original raiser position
      if (!SEAT_POS[heroPos]) return;
      // Find the corresponding RFI opening tab so we only quiz hands hero could hold
      const rfiCat = rfiNode && (rfiNode.children || []).find(c => c.name === heroPos);
      const rfiTab = rfiCat && (rfiCat.children || []).find(t => t.type === 'tab');
      (cat.children || []).forEach(tab => {
        if (tab.type !== 'tab') return;
        const match = tab.name.match(/vs\s+(.+)/i);
        if (!match) return;
        const raiserPos = match[1].trim(); // the 3-bettor
        if (!SEAT_POS[raiserPos]) return;
        scenarios.push({ tab, heroPos, raiserPos, type: 'vs3bet', rfiTab: rfiTab || null });
      });
    });
  }

  return scenarios;
}

function pickHand(scenario) {
  const inRange = [];
  (scenario.tab.ranges || []).forEach(r => inRange.push(...r.hands));
  let randomPool = ALL_HANDS;
  if (scenario.type === 'vs3bet' && scenario.rfiTab) {
    const rfiPool = [];
    (scenario.rfiTab.ranges || []).forEach(r => rfiPool.push(...r.hands));
    if (rfiPool.length > 0) randomPool = rfiPool;
  }
  if (inRange.length > 0 && Math.random() < 0.7) {
    return inRange[Math.floor(Math.random() * inRange.length)];
  }
  return randomPool[Math.floor(Math.random() * randomPool.length)];
}

function correctAction(hand, tab, type) {
  for (const r of (tab.ranges || [])) {
    if (!r.hands.includes(hand)) continue;
    const cls = rangeClass((DATA.rangeMeta[r.id] || { name: r.id }).name);
    if (cls === 'action-raise-value' || cls === 'action-raise-bluff') {
      if (type === 'rfi')    return 'open';
      if (type === 'vs3bet') return '4bet';
      return '3bet';
    }
    if (cls === 'action-call') return 'call';
  }
  return 'fold';
}

function makeTableSVG(heroPos, raiserPos) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '-5 -5 270 175');
  svg.setAttribute('class', 'quiz-table-svg');

  const felt = document.createElementNS(ns, 'ellipse');
  felt.setAttribute('cx', '130'); felt.setAttribute('cy', '82');
  felt.setAttribute('rx', '105'); felt.setAttribute('ry', '58');
  felt.setAttribute('fill', '#1a5c38');
  felt.setAttribute('stroke', '#c8a96e');
  felt.setAttribute('stroke-width', '5');
  svg.appendChild(felt);

  Object.entries(SEAT_POS).forEach(([pos, c]) => {
    const isHero = pos === heroPos;
    const isRaiser = raiserPos !== null && pos === raiserPos;
    const g = document.createElementNS(ns, 'g');

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', c.x); circle.setAttribute('cy', c.y);
    circle.setAttribute('r', '13');
    circle.setAttribute('fill', isHero ? '#2471a3' : isRaiser ? '#c0392b' : '#e8f5ee');
    circle.setAttribute('stroke', isHero || isRaiser ? '#fff' : '#999');
    circle.setAttribute('stroke-width', isHero || isRaiser ? '2.5' : '1');
    g.appendChild(circle);

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', c.x); text.setAttribute('y', c.y + 4);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '8');
    text.setAttribute('font-weight', isHero || isRaiser ? '700' : '400');
    text.setAttribute('fill', isHero || isRaiser ? '#fff' : '#333');
    text.setAttribute('font-family', 'system-ui, sans-serif');
    text.textContent = pos;
    g.appendChild(text);

    svg.appendChild(g);
  });
  return svg;
}

function makeHandDisplay(hand) {
  const div = document.createElement('div');
  div.className = 'quiz-hand';
  const isPair = hand.length === 2;
  const isSuited = hand.endsWith('s');
  const r1 = hand[0], r2 = hand[1];
  const suits  = isPair ? ['♠','♥'] : isSuited ? ['♠','♠'] : ['♠','♥'];
  const colors = isSuited ? ['spade','spade'] : ['spade','heart'];
  [r1, r2].forEach((rank, idx) => {
    const card = document.createElement('div');
    card.className = `quiz-card quiz-card-${colors[idx]}`;
    card.innerHTML = `<span class="qr">${rank}</span><span class="qs">${suits[idx]}</span>`;
    div.appendChild(card);
  });
  return div;
}

function makeHighlightGrid(tab, highlightHand) {
  const handMap = buildHandMap(tab);
  const wrap = document.createElement('div');
  wrap.className = 'range-grid-wrap';
  const grid = document.createElement('div');
  grid.className = 'range-grid';
  RANKS.forEach((_, i) => {
    RANKS.forEach((_, j) => {
      const h = cellToHand(i, j);
      const meta = handMap[h];
      const cell = document.createElement('div');
      cell.className = 'grid-cell' + (meta ? ' in-range' : '');
      if (meta) cell.classList.add(rangeClass(meta.name));
      if (h === highlightHand) cell.classList.add('quiz-hl');
      cell.textContent = h;
      grid.appendChild(cell);
    });
  });
  wrap.appendChild(grid);
  return wrap;
}

const quiz = { scenarios: [], score: 0, total: 0, current: null };

function nextQuizQuestion() {
  if (!quiz.scenarios.length) return;
  const s = quiz.scenarios[Math.floor(Math.random() * quiz.scenarios.length)];
  quiz.current = { scenario: s, hand: pickHand(s), answer: null };
}

function renderQuiz() {
  const view = document.getElementById('quiz-view');
  view.innerHTML = '';

  if (!quiz.scenarios.length) {
    const p = document.createElement('p');
    p.className = 'placeholder';
    p.textContent = 'No quiz scenarios found in data.';
    view.appendChild(p);
    return;
  }

  const scoreBar = document.createElement('div');
  scoreBar.className = 'quiz-score-bar';
  scoreBar.textContent = quiz.total === 0
    ? 'Answer questions to start scoring'
    : `Score: ${quiz.score} / ${quiz.total}  (${Math.round(100 * quiz.score / quiz.total)}%)`;
  view.appendChild(scoreBar);

  if (!quiz.current) nextQuizQuestion();
  const { scenario, hand, answer } = quiz.current;
  const { type } = scenario;
  const correct = correctAction(hand, scenario.tab, type);

  const wrap = document.createElement('div');
  wrap.className = 'quiz-wrap';

  wrap.appendChild(makeTableSVG(scenario.heroPos, scenario.raiserPos));

  const sit = document.createElement('div');
  sit.className = 'quiz-situation';
  sit.textContent = type === 'rfi'
    ? `You are in ${scenario.heroPos}. Open or fold?`
    : type === 'vs3bet'
    ? `You opened from ${scenario.heroPos}. ${scenario.raiserPos} 3-bets.`
    : `${scenario.raiserPos} opens. You are in ${scenario.heroPos}.`;
  wrap.appendChild(sit);

  wrap.appendChild(makeHandDisplay(hand));

  if (!answer) {
    const btns = document.createElement('div');
    btns.className = 'quiz-action-btns';
    const btnDefs = type === 'rfi'
      ? [['open','Open','btn-3bet'], ['fold','Fold','btn-fold']]
      : type === 'vs3bet'
      ? [['4bet','4-Bet','btn-3bet'], ['call','Call','btn-call'], ['fold','Fold','btn-fold']]
      : [['3bet','3-Bet','btn-3bet'], ['call','Call','btn-call'], ['fold','Fold','btn-fold']];
    btnDefs.forEach(([a, label, cls]) => {
      const btn = document.createElement('button');
      btn.className = `quiz-btn ${cls}`;
      btn.textContent = label;
      btn.addEventListener('click', () => handleQuizAnswer(a));
      btns.appendChild(btn);
    });
    wrap.appendChild(btns);
  } else {
    const isRight = answer === correct;
    const fb = document.createElement('div');
    fb.className = 'quiz-feedback ' + (isRight ? 'fb-correct' : 'fb-wrong');
    fb.textContent = isRight
      ? `Correct! The answer is ${correct.toUpperCase()}.`
      : `Wrong. Correct answer: ${correct.toUpperCase()}`;
    wrap.appendChild(fb);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'quiz-next-btn';
    nextBtn.textContent = 'Next hand →';
    nextBtn.addEventListener('click', () => { nextQuizQuestion(); renderQuiz(); });
    wrap.appendChild(nextBtn);

    const rev = document.createElement('div');
    rev.className = 'quiz-reveal';
    const revTitle = document.createElement('div');
    revTitle.className = 'quiz-reveal-title';
    revTitle.textContent = type === 'rfi'
      ? `${scenario.heroPos} — opening range:`
      : type === 'vs3bet'
      ? `${scenario.heroPos} vs ${scenario.raiserPos} 3-bet — full range:`
      : `${scenario.heroPos} vs ${scenario.raiserPos} — full range:`;
    rev.appendChild(revTitle);
    rev.appendChild(makeHighlightGrid(scenario.tab, hand));
    wrap.appendChild(rev);
  }

  view.appendChild(wrap);
}

function handleQuizAnswer(chosen) {
  if (!quiz.current || quiz.current.answer) return;
  const { hand, scenario } = quiz.current;
  const correct = correctAction(hand, scenario.tab, scenario.type);
  quiz.current.answer = chosen;
  quiz.total++;
  if (chosen === correct) quiz.score++;
  renderQuiz();
}

// ---------------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------------

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.view-nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(name + '-view').classList.add('active');
  document.querySelector(`.view-nav button[data-view="${name}"]`).classList.add('active');
  if (name === 'builder') renderBuilder();
  if (name === 'quiz') renderQuiz();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initApp(data) {
  DATA = data;

  document.getElementById('load-screen').remove();
  document.getElementById('app').style.display = 'flex';

  document.getElementById('page-title').textContent = DATA.title;
  document.getElementById('tree-panel').appendChild(buildTree(DATA.tree, 0));
  document.querySelectorAll('.view-nav button').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  quiz.scenarios = buildQuizScenarios();
  renderBuilder();
}

// ---------------------------------------------------------------------------
// Boot — fetch data from ?data= param or default
// ---------------------------------------------------------------------------

(function boot() {
  const params = new URLSearchParams(location.search);
  const dataUrl = params.get('data') || '../data/prod.json';

  fetch(dataUrl)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${dataUrl}`);
      return r.json();
    })
    .then(initApp)
    .catch(err => {
      const screen = document.getElementById('load-screen');
      screen.textContent = `Failed to load range data: ${err.message}`;
      screen.classList.add('error');
    });
})();
