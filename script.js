/* ========================================================
   HAND CRICKET — vs Computer
   Classic rule: each ball both sides secretly pick 0-6.
   If the numbers match -> the BATTER is out.
   Otherwise the batter scores the number THEY picked.
   ======================================================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const screens = {
  home: $('#screen-home'),
  settings: $('#screen-settings'),
  toss: $('#screen-toss'),
  game: $('#screen-game'),
  result: $('#screen-result'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------------- persistent stats (per browser) ---------------- */
const STORAGE_KEY = 'handcricket_stats_v1';
function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { played: 0, won: 0, best: 0 };
  } catch (e) {
    return { played: 0, won: 0, best: 0 };
  }
}
function saveStats(stats) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); } catch (e) { /* ignore */ }
}
function renderStats() {
  const s = loadStats();
  $('#stat-played').textContent = `${s.played} played`;
  $('#stat-won').textContent = `${s.won} won`;
  $('#stat-best').textContent = `best ${s.best}`;
}
renderStats();

/* keep avatar initial + name in sync */
const nameInput = $('#player-name');
function refreshAvatar() {
  const v = (nameInput.value || 'P').trim();
  $('#home-avatar').textContent = v.charAt(0).toUpperCase() || 'P';
}
nameInput.addEventListener('input', refreshAvatar);
refreshAvatar();

/* ---------------- game state ---------------- */
let state = null;

function freshState() {
  return {
    overs: 5,
    wickets: 5,
    difficulty: 'normal',
    battingFirst: null,   // 'player' | 'computer'
    inningsNum: 1,
    target: null,
    score: {
      player: { runs: 0, wkts: 0, balls: 0 },
      computer: { runs: 0, wkts: 0, balls: 0 },
    },
    thisOverPips: [],
    playerFreq: [0, 0, 0, 0, 0, 0, 0],
    locked: false,
  };
}

function playerName() {
  return (nameInput.value || 'You').trim() || 'You';
}

/* ---------------- navigation actions ---------------- */
document.body.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === 'go-home') { showScreen('home'); renderStats(); }
  if (action === 'go-mode') { state = freshState(); showScreen('settings'); }
  if (action === 'go-toss') {
    state.overs = parseInt($('#sel-overs').value, 10);
    state.wickets = parseInt($('#sel-wickets').value, 10);
    state.difficulty = $('#sel-difficulty').value;
    resetTossUI();
    showScreen('toss');
  }
  if (action === 'rematch') { state = freshState(); showScreen('settings'); }
});

/* ---------------- TOSS ---------------- */
function resetTossUI() {
  $('#coin').className = 'coin';
  $('#toss-result').textContent = '';
  $('#bat-bowl-row').classList.add('hidden');
  $('#call-row').classList.remove('hidden');
  $$('.call-btn[data-call]').forEach((b) => { b.disabled = false; b.classList.remove('selected'); });
}

$$('.call-btn[data-call]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (state.locked) return;
    state.locked = true;
    const call = btn.dataset.call;
    $$('.call-btn[data-call]').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    $$('.call-btn[data-call]').forEach((b) => (b.disabled = true));

    const coin = $('#coin');
    const landsHeads = Math.random() < 0.5;
    const extraSpins = 4 + Math.floor(Math.random() * 3); // full spins
    const finalAngle = extraSpins * 360 + (landsHeads ? 0 : 180);
    coin.style.setProperty('--spin', `${finalAngle}deg`);
    coin.classList.add('flipping');

    setTimeout(() => {
      const result = landsHeads ? 'heads' : 'tails';
      const playerWon = result === call;
      $('#toss-result').textContent = playerWon
        ? `It's ${result.toUpperCase()}! You won the toss.`
        : `It's ${result.toUpperCase()}! ${'Computer'} won the toss.`;

      if (playerWon) {
        $('#bat-bowl-row').classList.remove('hidden');
        state.locked = false;
      } else {
        // computer decides for itself, weighted toward batting first
        const computerChoosesBat = Math.random() < 0.55;
        state.battingFirst = computerChoosesBat ? 'computer' : 'player';
        setTimeout(() => startInnings(), 900);
      }
    }, 1650);
  });
});

$$('.bat-bowl-row .call-btn[data-choice]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.choice; // 'bat' | 'bowl'
    state.battingFirst = choice === 'bat' ? 'player' : 'computer';
    startInnings();
  });
});

/* ---------------- GAMEPLAY ---------------- */
function currentBattingSideKey() {
  const first = state.battingFirst;
  const second = first === 'player' ? 'computer' : 'player';
  return state.inningsNum === 1 ? first : second;
}

function startInnings() {
  showScreen('game');
  state.thisOverPips = [];
  renderGame();
  setupBallButtons();
}

function setupBallButtons() {
  $$('.ball').forEach((b) => {
    b.disabled = false;
    b.classList.remove('picked');
    b.onclick = () => onPlayerPick(parseInt(b.dataset.n, 10), b);
  });
}

function renderGame() {
  const battingKey = currentBattingSideKey();
  const isPlayerBatting = battingKey === 'player';

  const compScore = state.score.computer;
  const playScore = state.score.player;
  const battingScore = state.score[battingKey];
  const totalBalls = state.overs * 6;

  $('#team-a-tag').textContent = 'Computer';
  $('#team-b-tag').textContent = playerName();
  $('#team-a-role').textContent = battingKey === 'computer' ? 'Batting' : 'Bowling';
  $('#team-b-role').textContent = battingKey === 'player' ? 'Batting' : 'Bowling';

  $('#big-score').textContent = `${battingScore.runs}/${battingScore.wkts}`;
  const oversDone = (Math.floor(battingScore.balls / 6) + (battingScore.balls % 6) / 10).toFixed(1);
  $('#overs-line').textContent = `${oversDone} / ${state.overs}.0 ov`;

  const bannerName = isPlayerBatting ? 'You are' : `${playerName()} is`;
  $('#innings-banner').textContent = state.inningsNum === 1
    ? `Innings 1 — ${isPlayerBatting ? 'You are batting' : 'You are bowling'}`
    : `Innings 2 — ${isPlayerBatting ? 'You are batting' : 'You are bowling'}`;

  const targetLine = $('#target-line');
  if (state.inningsNum === 2 && state.target !== null) {
    targetLine.classList.remove('hidden');
    const need = state.target - battingScore.runs;
    targetLine.textContent = need > 0
      ? `Target ${state.target} — need ${need} off ${totalBalls - battingScore.balls} balls`
      : 'Target reached!';
  } else {
    targetLine.classList.add('hidden');
  }

  $('#hand-a-label').textContent = 'Computer';
  $('#hand-b-label').textContent = playerName();
  $('#hand-a').textContent = '✊';
  $('#hand-b').textContent = '✊';

  renderThisOver();
}

function renderThisOver() {
  const wrap = $('#this-over');
  wrap.innerHTML = '';
  state.thisOverPips.forEach((p) => {
    const el = document.createElement('span');
    el.className = 'pip' + (p.isWicket ? ' pip-w' : ' pip-run');
    el.textContent = p.isWicket ? 'W' : p.runs;
    wrap.appendChild(el);
  });
}

function pickComputerNumber(isPlayerBatting) {
  const diff = state.difficulty;
  const freq = state.playerFreq;
  const maxFreq = Math.max(...freq);

  if (diff === 'hard' && Math.random() < 0.55 && maxFreq > 0) {
    if (isPlayerBatting) {
      // computer is bowling: try to match player's most-used number
      const topIdx = freq.indexOf(maxFreq);
      return topIdx;
    } else {
      // computer is batting: avoid player's most-used delivery number
      const sorted = freq.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
      return sorted[0][1];
    }
  }
  return Math.floor(Math.random() * 7);
}

function showToast(text, isWicket) {
  const t = $('#toast');
  t.textContent = text;
  t.className = 'toast show' + (isWicket ? ' wicket' : '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 1100);
}

function onPlayerPick(num, btnEl) {
  if (state.locked) return;
  state.locked = true;

  $$('.ball').forEach((b) => (b.disabled = true));
  btnEl.classList.add('picked');

  const handA = $('#hand-a');
  const handB = $('#hand-b');
  handA.classList.add('shaking');
  handB.classList.add('shaking');

  const battingKey = currentBattingSideKey();
  const isPlayerBatting = battingKey === 'player';
  const compNum = pickComputerNumber(isPlayerBatting);

  state.playerFreq[num] += 1;

  setTimeout(() => {
    handA.classList.remove('shaking');
    handB.classList.remove('shaking');
    handA.textContent = numberEmoji(compNum);
    handB.textContent = numberEmoji(num);

    resolveBall(num, compNum, isPlayerBatting);
  }, 700);
}

function numberEmoji(n) {
  const map = ['✊', '☝️', '✌️', '🤟', '🖖', '🖐️', '👐'];
  return map[n] || '✊';
}

function resolveBall(playerNum, compNum, isPlayerBatting) {
  const battingKey = currentBattingSideKey();
  const batterNum = isPlayerBatting ? playerNum : compNum;
  const bowlerNum = isPlayerBatting ? compNum : playerNum;
  const isWicket = batterNum === bowlerNum;
  const runs = isWicket ? 0 : batterNum;

  const s = state.score[battingKey];
  s.balls += 1;
  if (isWicket) {
    s.wkts += 1;
  } else {
    s.runs += runs;
  }

  state.thisOverPips.push({ isWicket, runs });
  if (state.thisOverPips.length >= 6) {
    setTimeout(() => { state.thisOverPips = []; renderThisOver(); }, 900);
  }

  if (isWicket) showToast('OUT!', true);
  else if (runs === 6) showToast('SIX! 🚀', false);
  else if (runs === 4) showToast('FOUR!', false);

  renderGame();

  setTimeout(() => {
    if (checkInningsEnd()) {
      handleInningsEnd();
    } else {
      state.locked = false;
      setupBallButtons();
    }
  }, isWicket || runs >= 4 ? 900 : 250);
}

function checkInningsEnd() {
  const battingKey = currentBattingSideKey();
  const s = state.score[battingKey];
  const totalBalls = state.overs * 6;
  if (s.wkts >= state.wickets) return true;
  if (s.balls >= totalBalls) return true;
  if (state.inningsNum === 2 && state.target !== null && s.runs >= state.target) return true;
  return false;
}

function handleInningsEnd() {
  if (state.inningsNum === 1) {
    const firstKey = currentBattingSideKey();
    state.target = state.score[firstKey].runs + 1;
    state.inningsNum = 2;
    state.thisOverPips = [];
    showToast('Innings break', false);
    setTimeout(() => {
      state.locked = false;
      renderGame();
      setupBallButtons();
    }, 1200);
  } else {
    finishMatch();
  }
}

function finishMatch() {
  const firstKey = state.battingFirst;
  const secondKey = firstKey === 'player' ? 'computer' : 'player';
  const firstRuns = state.score[firstKey].runs;
  const secondRuns = state.score[secondKey].runs;

  const stats = loadStats();
  stats.played += 1;
  const playerRuns = state.score.player.runs;
  if (playerRuns > stats.best) stats.best = playerRuns;

  let title, sub, playerWon = null;
  if (secondRuns > firstRuns) {
    const wicketsInHand = state.wickets - state.score[secondKey].wkts;
    const winnerName = secondKey === 'player' ? playerName() : 'Computer';
    title = `${winnerName} won by ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'}!`;
    playerWon = secondKey === 'player';
  } else if (secondRuns < firstRuns) {
    const margin = firstRuns - secondRuns;
    const winnerName = firstKey === 'player' ? playerName() : 'Computer';
    title = `${winnerName} won by ${margin} run${margin === 1 ? '' : 's'}!`;
    playerWon = firstKey === 'player';
  } else {
    title = "It's a tie!";
    playerWon = false;
  }

  if (playerWon) stats.won += 1;
  saveStats(stats);

  sub = `${firstKey === 'player' ? playerName() : 'Computer'} scored ${firstRuns}/${state.score[firstKey].wkts} — ` +
        `${secondKey === 'player' ? playerName() : 'Computer'} scored ${secondRuns}/${state.score[secondKey].wkts}`;

  $('#result-emoji').textContent = playerWon ? '🏆' : (title.includes('tie') ? '🤝' : '😔');
  $('#result-title').textContent = title;
  $('#result-sub').textContent = sub;
  $('#rs-innings1').textContent = `${firstRuns}/${state.score[firstKey].wkts}`;
  $('#rs-innings2').textContent = `${secondRuns}/${state.score[secondKey].wkts}`;

  showScreen('result');
}
