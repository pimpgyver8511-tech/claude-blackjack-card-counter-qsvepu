'use strict';

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = [
  { symbol: '♠', color: 'black' },
  { symbol: '♥', color: 'red' },
  { symbol: '♦', color: 'red' },
  { symbol: '♣', color: 'black' },
];

const STORAGE_KEY = 'bj-counter-state-v1';

function loadState() {
  const defaults = {
    decks: 6,
    rules: { s17: true, das: true, surrender: true },
    betUnit: 10,
    runningCount: 0,
    cardsSeen: 0,
    usedCards: {},
    dealer: [],
    playerHands: [[]],
    activeHandIndex: 0,
    other: [],
    activeTarget: 'dealer',
    log: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return Object.assign(defaults, parsed);
  } catch (e) {
    return defaults;
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function cardValue(rank) {
  if (rank === 'A') return 11;
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

function hiLoValue(rank) {
  if (['2', '3', '4', '5', '6'].includes(rank)) return 1;
  if (['7', '8', '9'].includes(rank)) return 0;
  return -1;
}

function pairGroup(rank) {
  if (rank === 'A') return 'A';
  if (['10', 'J', 'Q', 'K'].includes(rank)) return '10';
  return rank;
}

function handTotal(cards) {
  let total = 0;
  let aces = 0;
  cards.forEach((c) => {
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  });
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { value: total, soft: aces > 0, bust: total > 21 };
}

function dealerUpValue() {
  if (state.dealer.length === 0) return null;
  return cardValue(state.dealer[0].rank);
}

// ---------- Basic strategy ----------

function pairAction(group, dealerVal, das) {
  switch (group) {
    case '2':
    case '3': {
      const cols = das ? [2, 3, 4, 5, 6, 7] : [3, 4, 5, 6, 7];
      return cols.includes(dealerVal) ? 'P' : null;
    }
    case '4': {
      const cols = das ? [5, 6] : [];
      return cols.includes(dealerVal) ? 'P' : null;
    }
    case '6': {
      const cols = das ? [2, 3, 4, 5, 6] : [3, 4, 5, 6];
      return cols.includes(dealerVal) ? 'P' : null;
    }
    case '7':
      return [2, 3, 4, 5, 6, 7].includes(dealerVal) ? 'P' : null;
    case '8':
      return 'P';
    case '9':
      return [2, 3, 4, 5, 6, 8, 9].includes(dealerVal) ? 'P' : 'S';
    case 'A':
      return 'P';
    default:
      return null;
  }
}

function hardAction(total, dealerVal, canDouble, rules) {
  if (total <= 8) return 'H';
  if (total === 9) return canDouble && [3, 4, 5, 6].includes(dealerVal) ? 'D' : 'H';
  if (total === 10) return canDouble && dealerVal <= 9 ? 'D' : 'H';
  if (total === 11) return canDouble && dealerVal <= 10 ? 'D' : 'H';
  if (total === 12) return [4, 5, 6].includes(dealerVal) ? 'S' : 'H';
  if (total === 13 || total === 14) return dealerVal <= 6 ? 'S' : 'H';
  if (total === 15) {
    if (dealerVal <= 6) return 'S';
    if (dealerVal === 10 && rules.surrender) return 'R';
    return 'H';
  }
  if (total === 16) {
    if (dealerVal <= 6) return 'S';
    if ([9, 10, 11].includes(dealerVal) && rules.surrender) return 'R';
    return 'H';
  }
  return 'S';
}

function softAction(total, dealerVal, canDouble) {
  if (total === 13 || total === 14) return canDouble && [5, 6].includes(dealerVal) ? 'D' : 'H';
  if (total === 15 || total === 16) return canDouble && [4, 5, 6].includes(dealerVal) ? 'D' : 'H';
  if (total === 17) return canDouble && [3, 4, 5, 6].includes(dealerVal) ? 'D' : 'H';
  if (total === 18) {
    if (canDouble && [3, 4, 5, 6].includes(dealerVal)) return 'D';
    if ([2, 7, 8].includes(dealerVal)) return 'S';
    return 'H';
  }
  if (total === 19) return canDouble && dealerVal === 6 ? 'D' : 'S';
  return 'S';
}

// Illustrious-18-inspired true-count deviations (Hi-Lo)
const DEVIATIONS = [
  { total: 16, dealer: 10, tc: 0, action: 'S' },
  { total: 15, dealer: 10, tc: 4, action: 'S' },
  { total: 10, dealer: 10, tc: 4, action: 'D' },
  { total: 12, dealer: 2, tc: 3, action: 'S' },
  { total: 12, dealer: 3, tc: 2, action: 'S' },
  { total: 11, dealer: 11, tc: 1, action: 'D' },
  { total: 9, dealer: 2, tc: 1, action: 'D' },
  { total: 10, dealer: 11, tc: 4, action: 'D' },
  { total: 9, dealer: 7, tc: 3, action: 'D' },
  { total: 16, dealer: 9, tc: 5, action: 'S' },
  { total: 13, dealer: 2, tc: -1, action: 'H', invert: true },
  { total: 12, dealer: 5, tc: -2, action: 'H', invert: true },
  { total: 12, dealer: 6, tc: -1, action: 'H', invert: true },
  { total: 13, dealer: 3, tc: -2, action: 'H', invert: true },
];

function findDeviation(total, dealerVal, trueCount) {
  const rule = DEVIATIONS.find((d) => d.total === total && d.dealer === dealerVal);
  if (!rule) return null;
  const applies = rule.invert ? trueCount <= rule.tc : trueCount >= rule.tc;
  if (!applies) return null;
  return rule;
}

function getAdvice(cards, dealerVal, trueCount, rules) {
  if (cards.length === 0 || dealerVal === null) return null;
  const canDouble = cards.length === 2;
  const total = handTotal(cards);

  let action;
  let isPairChoice = false;

  if (canDouble && pairGroup(cards[0].rank) === pairGroup(cards[1].rank)) {
    const pAction = pairAction(pairGroup(cards[0].rank), dealerVal, rules.das);
    if (pAction) {
      action = pAction;
      isPairChoice = pAction === 'P';
    }
  }

  if (action === undefined) {
    action = total.soft
      ? softAction(total.value, dealerVal, canDouble)
      : hardAction(total.value, dealerVal, canDouble, rules);
  }

  let deviation = null;
  if (!isPairChoice && !total.soft) {
    deviation = findDeviation(total.value, dealerVal, trueCount);
    if (deviation) action = deviation.action;
  }

  return { action, total, deviation };
}

const ACTION_LABELS = {
  H: { label: 'HIT — Karte ziehen', cls: 'act-hit' },
  S: { label: 'STAND — stehen bleiben', cls: 'act-stand' },
  D: { label: 'DOUBLE — verdoppeln', cls: 'act-double' },
  P: { label: 'SPLIT — teilen', cls: 'act-split' },
  R: { label: 'SURRENDER — aufgeben', cls: 'act-surrender' },
};

function insuranceAdvice(trueCount) {
  return trueCount >= 3;
}

const BET_STEPS = [
  { tc: -Infinity, mult: 1 },
  { tc: 1, mult: 1.5 },
  { tc: 2, mult: 2 },
  { tc: 3, mult: 4 },
  { tc: 4, mult: 6 },
  { tc: 5, mult: 8 },
];

function getBetStepIndex(trueCount) {
  let idx = 0;
  for (let i = 0; i < BET_STEPS.length; i++) {
    if (trueCount >= BET_STEPS[i].tc) idx = i;
  }
  return idx;
}

function betSuggestion(trueCount) {
  const unit = Number(state.betUnit) || 10;
  const mult = BET_STEPS[getBetStepIndex(trueCount)].mult;
  const amount = Math.round(unit * mult);
  return `${mult}x Einheit (${amount}€)`;
}

// ---------- Rendering ----------

function cardKey(rank, suit) {
  return `${rank}-${suit}`;
}

function renderCardEl(card) {
  const suitMeta = SUITS.find((s) => s.symbol === card.suit);
  const el = document.createElement('div');
  el.className = `card ${suitMeta.color}`;
  el.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${card.suit}</span>`;
  return el;
}

function totalLabel(total) {
  if (total.bust) return `<span class="bust">BUST (${total.value})</span>`;
  if (total.value === 21 && total.soft) return `<span class="bj">21</span>`;
  return `${total.value}${total.soft ? ' (soft)' : ''}`;
}

function buildTargetKey(kind, idx) {
  return kind === 'player' ? `player-${idx}` : kind;
}

function render() {
  document.getElementById('deckCount').value = state.decks;
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.getAttribute('data-decks')) === state.decks);
  });
  document.getElementById('dealerSoft17').value = state.rules.s17 ? 'stand' : 'hit';
  document.getElementById('rulesDas').checked = state.rules.das;
  document.getElementById('rulesSurrender').checked = state.rules.surrender;
  document.getElementById('betUnit').value = state.betUnit;

  const decksRemaining = Math.max((state.decks * 52 - state.cardsSeen) / 52, 0.25);
  const trueCount = state.runningCount / decksRemaining;

  document.getElementById('runningCount').textContent = state.runningCount > 0 ? `+${state.runningCount}` : state.runningCount;
  document.getElementById('trueCount').textContent = (trueCount > 0 ? '+' : '') + trueCount.toFixed(1);
  document.getElementById('decksRemaining').textContent = decksRemaining.toFixed(1);
  document.getElementById('cardsSeen').textContent = `${state.cardsSeen}/${state.decks * 52}`;
  document.getElementById('betSuggestion').textContent = betSuggestion(trueCount);

  const betStepIdx = getBetStepIndex(trueCount);
  const betScale = document.getElementById('betScale');
  betScale.innerHTML = '';
  BET_STEPS.forEach((step, i) => {
    const chip = document.createElement('span');
    chip.className = 'step' + (i === betStepIdx ? ' active' : '');
    chip.textContent = `${step.mult}x`;
    betScale.appendChild(chip);
  });
  const betNext = document.getElementById('betNext');
  if (betStepIdx < BET_STEPS.length - 1) {
    const next = BET_STEPS[betStepIdx + 1];
    const diff = Math.max(next.tc - trueCount, 0).toFixed(1);
    betNext.textContent = `Nächste Stufe (${next.mult}x) ab True Count ≥ ${next.tc} · noch +${diff}`;
  } else {
    betNext.textContent = 'Höchste Stufe erreicht';
  }

  // dealer
  const dealerHandEl = document.getElementById('dealerHand');
  dealerHandEl.innerHTML = '';
  state.dealer.forEach((c) => dealerHandEl.appendChild(renderCardEl(c)));
  const dTotal = handTotal(state.dealer);
  document.getElementById('dealerTotal').innerHTML = state.dealer.length ? totalLabel(dTotal) : '';

  // other cards
  const otherEl = document.getElementById('otherHand');
  otherEl.innerHTML = '';
  state.other.forEach((c) => otherEl.appendChild(renderCardEl(c)));

  // player hands
  const playerArea = document.getElementById('playerArea');
  playerArea.innerHTML = '';
  const dVal = dealerUpValue();
  const decksRem = decksRemaining;

  state.playerHands.forEach((hand, idx) => {
    const block = document.createElement('section');
    block.className = 'hand-block player-block';
    block.setAttribute('data-target', buildTargetKey('player', idx));
    const isActive = state.activeTarget === buildTargetKey('player', idx);
    if (isActive) block.classList.add('active-target');

    const header = document.createElement('div');
    header.className = 'hand-header';
    const label = state.playerHands.length > 1 ? `Spieler – Hand ${idx + 1}` : 'Spieler';
    header.innerHTML = `<h2>${label}</h2><span class="target-badge">● aktiv</span>`;
    block.appendChild(header);

    const cardsEl = document.createElement('div');
    cardsEl.className = 'hand-cards';
    hand.forEach((c) => cardsEl.appendChild(renderCardEl(c)));
    block.appendChild(cardsEl);

    const totalEl = document.createElement('div');
    totalEl.className = 'hand-total';
    if (hand.length) totalEl.innerHTML = totalLabel(handTotal(hand));
    block.appendChild(totalEl);

    playerArea.appendChild(block);
  });

  // dealer/other active-target highlight
  document.querySelector('.dealer-block').classList.toggle('active-target', state.activeTarget === 'dealer');
  document.querySelector('.other-block').classList.toggle('active-target', state.activeTarget === 'other');

  document.getElementById('activeTargetLabel').textContent = activeTargetLabelText();

  // split button
  const activeHand = getActiveHandCards();
  const splitBtn = document.getElementById('splitBtn');
  const canOfferSplit =
    state.activeTarget.startsWith('player-') &&
    activeHand &&
    activeHand.length === 2 &&
    pairGroup(activeHand[0].rank) === pairGroup(activeHand[1].rank) &&
    state.playerHands.length < 4;
  splitBtn.classList.toggle('hidden', !canOfferSplit);

  // advice
  const advicePanel = document.getElementById('advicePanel');
  const adviceMain = document.getElementById('adviceMain');
  const adviceSub = document.getElementById('adviceSub');

  if (state.activeTarget.startsWith('player-') && activeHand && activeHand.length > 0 && dVal !== null) {
    const advice = getAdvice(activeHand, dVal, trueCount, state.rules);
    advicePanel.classList.remove('hidden');
    const info = ACTION_LABELS[advice.action] || { label: advice.action, cls: '' };
    adviceMain.textContent = info.label;
    adviceMain.className = 'advice-main ' + info.cls;
    let sub = '';
    if (advice.deviation) {
      sub += `<span class="dev">Count-Abweichung aktiv</span> (Standard wäre sonst anders) · `;
    }
    sub += `Hand: ${totalLabel(advice.total).replace(/<[^>]+>/g, '')} gegen Dealer ${state.dealer[0].rank}`;
    adviceSub.innerHTML = sub;
  } else if (dVal === 11 && state.dealer.length >= 1) {
    advicePanel.classList.remove('hidden');
    const ins = insuranceAdvice(trueCount);
    adviceMain.textContent = ins ? 'VERSICHERUNG: JA nehmen' : 'Versicherung: nicht nehmen';
    adviceMain.className = 'advice-main ' + (ins ? 'act-double' : 'act-hit');
    adviceSub.textContent = `True Count ${trueCount.toFixed(1)} — Versicherung lohnt sich ab True Count ≥ 3`;
  } else {
    advicePanel.classList.add('hidden');
  }

  renderPicker();
  saveState();
}

function activeTargetLabelText() {
  if (state.activeTarget === 'dealer') return 'Dealer';
  if (state.activeTarget === 'other') return 'Weitere Karten';
  if (state.activeTarget.startsWith('player-')) {
    const idx = Number(state.activeTarget.split('-')[1]);
    return state.playerHands.length > 1 ? `Spieler Hand ${idx + 1}` : 'Spieler';
  }
  return state.activeTarget;
}

function getActiveHandCards() {
  if (state.activeTarget === 'dealer') return state.dealer;
  if (state.activeTarget === 'other') return state.other;
  if (state.activeTarget.startsWith('player-')) {
    const idx = Number(state.activeTarget.split('-')[1]);
    return state.playerHands[idx];
  }
  return null;
}

function renderPicker() {
  const picker = document.getElementById('picker');
  picker.innerHTML = '';
  RANKS.forEach((rank) => {
    SUITS.forEach((suit) => {
      const key = cardKey(rank, suit.symbol);
      const used = state.usedCards[key] || 0;
      const btn = document.createElement('button');
      btn.className = `pick-card ${suit.color}`;
      btn.innerHTML = `<span class="rank">${rank}</span><span class="suit">${suit.symbol}</span>`;
      btn.disabled = used >= state.decks;
      btn.addEventListener('click', () => addCard(rank, suit.symbol));
      picker.appendChild(btn);
    });
  });
}

// ---------- Actions ----------

function addCard(rank, suit) {
  const key = cardKey(rank, suit);
  const used = state.usedCards[key] || 0;
  if (used >= state.decks) return;

  const card = { rank, suit };
  const target = state.activeTarget;

  if (target === 'dealer') state.dealer.push(card);
  else if (target === 'other') state.other.push(card);
  else if (target.startsWith('player-')) {
    const idx = Number(target.split('-')[1]);
    state.playerHands[idx].push(card);
  } else return;

  state.usedCards[key] = used + 1;
  state.runningCount += hiLoValue(rank);
  state.cardsSeen += 1;
  state.log.push({ type: 'card', target, card, key });

  render();
}

function undo() {
  const last = state.log.pop();
  if (!last) return;

  if (last.type === 'split') {
    const { idx } = last;
    const [c2] = state.playerHands[idx + 1];
    state.playerHands[idx].push(c2);
    state.playerHands.splice(idx + 1, 1);
    state.activeTarget = buildTargetKey('player', idx);
    render();
    return;
  }

  if (last.type === 'addHand') {
    state.playerHands.splice(last.idx, 1);
    state.activeTarget = buildTargetKey('player', Math.max(last.idx - 1, 0));
    render();
    return;
  }

  const { target, card, key } = last;
  if (target === 'dealer') state.dealer.pop();
  else if (target === 'other') state.other.pop();
  else if (target.startsWith('player-')) {
    const idx = Number(target.split('-')[1]);
    state.playerHands[idx].pop();
  }

  state.usedCards[key] = Math.max((state.usedCards[key] || 1) - 1, 0);
  state.runningCount -= hiLoValue(card.rank);
  state.cardsSeen = Math.max(state.cardsSeen - 1, 0);

  render();
}

function resetShoeState() {
  state.runningCount = 0;
  state.cardsSeen = 0;
  state.usedCards = {};
  state.dealer = [];
  state.playerHands = [[]];
  state.other = [];
  state.activeHandIndex = 0;
  state.activeTarget = 'dealer';
  state.log = [];
}

function applyDeckCount(newDecks) {
  const clamped = Math.min(Math.max(Math.round(newDecks) || 1, 1), 12);
  if (clamped === state.decks) {
    render();
    return;
  }
  const hasProgress = state.cardsSeen > 0;
  if (hasProgress && !confirm(`Deckanzahl auf ${clamped} ändern setzt den aktuellen Schuh (Count) zurück. Fortfahren?`)) {
    render();
    return;
  }
  state.decks = clamped;
  resetShoeState();
  render();
}

function newRound() {
  state.dealer = [];
  state.playerHands = [[]];
  state.other = [];
  state.activeHandIndex = 0;
  state.activeTarget = 'dealer';
  state.log = [];
  render();
}

function resetShoe() {
  if (!confirm('Neuen Schuh starten? Der Count wird auf 0 zurückgesetzt.')) return;
  resetShoeState();
  render();
}

function splitActiveHand() {
  if (!state.activeTarget.startsWith('player-')) return;
  const idx = Number(state.activeTarget.split('-')[1]);
  const hand = state.playerHands[idx];
  if (hand.length !== 2) return;
  const [c1, c2] = hand;
  state.playerHands[idx] = [c1];
  state.playerHands.splice(idx + 1, 0, [c2]);
  state.log.push({ type: 'split', idx });
  state.activeTarget = buildTargetKey('player', idx);
  render();
}

function addPlayerHand() {
  if (state.playerHands.length >= 4) return;
  state.playerHands.push([]);
  const idx = state.playerHands.length - 1;
  state.log.push({ type: 'addHand', idx });
  state.activeTarget = buildTargetKey('player', idx);
  render();
}

// ---------- Event wiring ----------

document.getElementById('settingsToggle').addEventListener('click', () => {
  document.getElementById('settingsPanel').classList.toggle('hidden');
});

document.getElementById('deckCount').addEventListener('change', (e) => {
  applyDeckCount(Number(e.target.value));
});
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyDeckCount(Number(btn.getAttribute('data-decks')));
  });
});
document.getElementById('dealerSoft17').addEventListener('change', (e) => {
  state.rules.s17 = e.target.value === 'stand';
  render();
});
document.getElementById('rulesDas').addEventListener('change', (e) => {
  state.rules.das = e.target.checked;
  render();
});
document.getElementById('rulesSurrender').addEventListener('change', (e) => {
  state.rules.surrender = e.target.checked;
  render();
});
document.getElementById('betUnit').addEventListener('change', (e) => {
  state.betUnit = Number(e.target.value) || 10;
  render();
});

document.getElementById('resetShoeBtn').addEventListener('click', resetShoe);
document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('newRoundBtn').addEventListener('click', newRound);
document.getElementById('splitBtn').addEventListener('click', splitActiveHand);
document.getElementById('addHandBtn').addEventListener('click', addPlayerHand);

document.querySelector('.table').addEventListener('click', (e) => {
  const block = e.target.closest('[data-target]');
  if (!block) return;
  const target = block.getAttribute('data-target');
  state.activeTarget = target;
  if (target.startsWith('player-')) {
    state.activeHandIndex = Number(target.split('-')[1]);
  }
  render();
});

render();
