/* ========================================================
   HAND CRICKET — vs Computer + Tournament
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
  stats: $('#screen-stats'),
  'tournament-home': $('#screen-tournament-home'),
  'tournament-bracket': $('#screen-tournament-bracket'),
};

function showScreen(name) {
  // Query all .screen elements fresh each time so this stays correct even
  // after multiplayer.js adds more screens dynamically to the page.
  $$('.screen').forEach((s) => s.classList.remove('active'));
  const target = screens[name] || document.getElementById(`screen-${name}`);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
}

/* ---------------- helpers ---------------- */
function readIntSelect(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const v = parseInt(el.value, 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
function readSelectValue(id, fallback) {
  const el = document.getElementById(id);
  return el && el.value ? el.value : fallback;
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/* ---------------- preferences (sound / theme) ---------------- */
const PREFS_KEY = 'handcricket_prefs_v1';
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? Object.assign({ sound: true, theme: 'dark' }, JSON.parse(raw)) : { sound: true, theme: 'dark' };
  } catch (e) { return { sound: true, theme: 'dark' }; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
}
let prefs = loadPrefs();

function applyTheme() {
  document.body.classList.toggle('theme-light', prefs.theme === 'light');
  $$('.theme-btn').forEach((b) => b.classList.toggle('active', b.dataset.theme === prefs.theme));
}
function applySoundToggleUI() {
  $('#toggle-sound').classList.toggle('on', !!prefs.sound);
}

/* ---------------- sound engine (WebAudio, no external files) ---------------- */
let audioCtx = null;
function getCtx() {
  if (!prefs.sound) return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, start, dur, type = 'sine', vol = 0.18) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.02);
}
const sfx = {
  click: () => tone(520, 0, 0.07, 'square', 0.12),
  four: () => { tone(520, 0, 0.1); tone(660, 0.08, 0.15); },
  six: () => { tone(520, 0, 0.08); tone(660, 0.08, 0.08); tone(880, 0.16, 0.2); },
  wicket: () => { tone(180, 0, 0.25, 'sawtooth', 0.2); tone(90, 0.1, 0.3, 'sawtooth', 0.15); },
  coin: () => { tone(1200, 0, 0.05, 'square', 0.08); tone(900, 0.05, 0.05, 'square', 0.08); },
  win: () => { tone(523, 0, 0.12); tone(659, 0.12, 0.12); tone(784, 0.24, 0.25); },
};

/* ---------------- persistent stats (per browser, optionally synced to the cloud when logged in) ---------------- */
const STATS_KEY = 'handcricket_stats_v3';
const STAT_BUCKETS = ['easy', 'normal', 'hard', 'tournamentAI', 'tournamentOnline', 'multiplayer'];
function emptyModeStats() {
  return {
    played: 0, won: 0, lost: 0, tied: 0,
    totalRuns: 0, ballsFaced: 0, totalWickets: 0,
    bestScore: 0, bestBowlWkts: 0, bestBowlRuns: 0,
  };
}
function emptyTournamentExtra() {
  return { tournamentsPlayed: 0, tournamentsWon: 0 };
}
const TOURNAMENT_BUCKETS = ['tournamentAI', 'tournamentOnline'];
function loadStatsV2() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const out = {};
    STAT_BUCKETS.forEach((b) => { out[b] = Object.assign(emptyModeStats(), parsed && parsed[b]); });
    TOURNAMENT_BUCKETS.forEach((b) => { out[b] = Object.assign(out[b], emptyTournamentExtra(), parsed && parsed[b]); });
    return out;
  } catch (e) {
    const out = {};
    STAT_BUCKETS.forEach((b) => { out[b] = emptyModeStats(); });
    TOURNAMENT_BUCKETS.forEach((b) => { out[b] = Object.assign(out[b], emptyTournamentExtra()); });
    return out;
  }
}
function saveStatsV2(s) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  // If a login system is active and the person is signed in, auth.js sets
  // these two globals — mirror every save to their cloud profile too.
  if (window.HC_cloudSyncEnabled && window.HC_currentUID && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
    try { firebase.database().ref('users/' + window.HC_currentUID + '/stats').set(s); } catch (e) { console.error('cloud stat sync failed', e); }
  }
}
function strikeRateOf(ms) {
  return ms.ballsFaced > 0 ? ((ms.totalRuns / ms.ballsFaced) * 100).toFixed(1) : '0.0';
}

/* Shared stat recorder — used by the local vs-computer engine below AND by
   multiplayer.js / tournament-online.js (via window.HC_recordMatchStats)
   for online 1v1 and online-tournament matches. */
function recordMatchStats(bucket, { outcome, runsScored, ballsFaced, wicketsTaken, runsConceded }) {
  const stats = loadStatsV2();
  const ms = stats[bucket] || (stats[bucket] = emptyModeStats());
  ms.played += 1;
  if (outcome === 'win') ms.won += 1;
  else if (outcome === 'lose') ms.lost += 1;
  else ms.tied += 1;
  ms.totalRuns += runsScored;
  ms.ballsFaced += ballsFaced;
  ms.totalWickets += wicketsTaken;
  if (runsScored > ms.bestScore) ms.bestScore = runsScored;
  if (
    wicketsTaken > ms.bestBowlWkts ||
    (wicketsTaken === ms.bestBowlWkts && ms.bestBowlWkts > 0 && runsConceded < ms.bestBowlRuns) ||
    ms.played === 1
  ) {
    ms.bestBowlWkts = wicketsTaken;
    ms.bestBowlRuns = runsConceded;
  }
  saveStatsV2(stats);
  return stats;
}
window.HC_recordMatchStats = recordMatchStats;

// bucket must be one of TOURNAMENT_BUCKETS ('tournamentAI' for local Vs-AI
// tournaments, 'tournamentOnline' for Vs Real Players tournaments).
function recordTournamentStarted(bucket) {
  const stats = loadStatsV2();
  stats[bucket].tournamentsPlayed += 1;
  saveStatsV2(stats);
}
function recordTournamentWon(bucket) {
  const stats = loadStatsV2();
  stats[bucket].tournamentsWon += 1;
  saveStatsV2(stats);
}
window.HC_recordTournamentStarted = recordTournamentStarted;
window.HC_recordTournamentWon = recordTournamentWon;

function renderHomeStats() {
  const s = loadStatsV2();
  const played = s.easy.played + s.normal.played + s.hard.played;
  const won = s.easy.won + s.normal.won + s.hard.won;
  const best = Math.max(s.easy.bestScore, s.normal.bestScore, s.hard.bestScore);
  $('#stat-played').textContent = `${played} played`;
  $('#stat-won').textContent = `${won} won`;
  $('#stat-best').textContent = `best ${best}`;
}
renderHomeStats();
// Exposed so auth.js can refresh the visible numbers right after a cloud/local stats merge.
window.HC_refreshStatsUI = function () {
  renderHomeStats();
  const statsScreen = document.getElementById('screen-stats');
  if (statsScreen && statsScreen.classList.contains('active')) renderStatsScreen();
};

const STAT_TAB_LABELS = {
  easy: 'Easy', normal: 'Normal', hard: 'Hard',
  tournamentAI: 'Tournament (AI)', tournamentOnline: 'Tournament (Online)', multiplayer: 'Multiplayer',
};
let statsActiveTab = 'easy';
function renderStatsScreen() {
  const s = loadStatsV2()[statsActiveTab];
  $$('#stats-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.diff === statsActiveTab));
  const winPct = s.played ? Math.round((s.won / s.played) * 100) : 0;
  $('#stat-summary').textContent = `${STAT_TAB_LABELS[statsActiveTab]} — Matches Won: ${s.won} off ${s.played} (${winPct}%)`;
  const bowlFigure = s.played ? `${s.bestBowlWkts}-${s.bestBowlRuns}` : '—';
  const isTournamentBucket = TOURNAMENT_BUCKETS.indexOf(statsActiveTab) !== -1;
  const extraTournamentBox = isTournamentBucket
    ? `<div class="stat-box"><strong>${s.tournamentsWon}/${s.tournamentsPlayed}</strong><span>Tournaments Won</span></div>`
    : '';
  $('#stat-grid').innerHTML = `
    <div class="stat-box"><strong>${s.played}</strong><span>Played</span></div>
    <div class="stat-box"><strong>${s.won}-${s.lost}-${s.tied}</strong><span>Win-Loss-Tied</span></div>
    <div class="stat-box"><strong>${s.bestScore}</strong><span>Best Score</span></div>
    <div class="stat-box"><strong>${s.totalRuns}</strong><span>Total Runs</span></div>
    <div class="stat-box"><strong>${strikeRateOf(s)}</strong><span>Strike Rate</span></div>
    <div class="stat-box"><strong>${bowlFigure}</strong><span>Best Bowling</span></div>
    <div class="stat-box"><strong>${s.totalWickets}</strong><span>Total Wickets</span></div>
    ${extraTournamentBox}
  `;
}

/* keep avatar initial + name in sync, and persist the player's chosen name
   permanently in this browser (so a shared link never shows "Vaibhav" to
   someone else, and a returning visitor's own name sticks around) */
const NAME_KEY = 'handcricket_playername';
const nameInput = $('#player-name');
function randomGuestName() {
  return 'Guest' + Math.floor(1000 + Math.random() * 9000);
}
(function initPlayerName() {
  let saved = null;
  try { saved = localStorage.getItem(NAME_KEY); } catch (e) { /* ignore */ }
  if (!saved) {
    saved = randomGuestName();
    try { localStorage.setItem(NAME_KEY, saved); } catch (e) { /* ignore */ }
  }
  nameInput.value = saved;
})();
function persistPlayerName() {
  const v = (nameInput.value || '').trim();
  if (!v) return;
  try { localStorage.setItem(NAME_KEY, v); } catch (e) { /* ignore */ }
}
function refreshAvatar() {
  const v = (nameInput.value || 'P').trim();
  $('#home-avatar').textContent = v.charAt(0).toUpperCase() || 'P';
  persistPlayerName();
}
nameInput.addEventListener('input', refreshAvatar);
nameInput.addEventListener('blur', persistPlayerName);
nameInput.addEventListener('change', persistPlayerName);
refreshAvatar();
function playerName() { return (nameInput.value || 'You').trim() || 'You'; }

/* ---------------- single-match game state ---------------- */
let state = null;

function freshState(overs, wickets, difficulty, opponentName) {
  return {
    overs, wickets, difficulty,
    opponentName: opponentName || 'Computer',
    battingFirst: null,
    inningsNum: 1,
    target: null,
    score: {
      player: { runs: 0, wkts: 0, balls: 0 },
      computer: { runs: 0, wkts: 0, balls: 0 },
    },
    thisOverPips: [],
    playerFreqBatting: [0, 0, 0, 0, 0, 0, 0],
    playerFreqBowling: [0, 0, 0, 0, 0, 0, 0],
    recentBatting: [],
    recentBowling: [],
    botBatPicks: [],
    botBowlPicks: [],
    locked: false,
    tournamentPendingRef: null, // {roundIndex, matchIndex} when this match belongs to the LOCAL vs-AI tournament
    onlineTournamentRef: null, // {code, roundIndex, matchIndex} when this is a bot-fill fixture inside an ONLINE tournament
  };
}

const DIFFICULTY_NOTES = {
  easy: 'Very forgiving — rarely takes wickets, innings usually go the distance.',
  normal: 'Balanced — a fair, competitive game either way could go.',
  hard: 'Ruthless — studies your picks and adapts fast. Winning takes real variation in your numbers.',
};
function updateDifficultyNote() {
  const diff = readSelectValue('sel-difficulty', 'normal');
  $('#difficulty-note').textContent = DIFFICULTY_NOTES[diff] || '';
}
document.addEventListener('DOMContentLoaded', updateDifficultyNote);
updateDifficultyNote();
$('#sel-difficulty') && $('#sel-difficulty').addEventListener('change', updateDifficultyNote);

/* ---------------- navigation / actions ---------------- */
document.body.addEventListener('click', (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === 'go-home') { showScreen('home'); renderHomeStats(); }

  if (action === 'go-mode') {
    const overs = readIntSelect('sel-overs', 5);
    const wickets = readIntSelect('sel-wickets', 5);
    updateDifficultyNote();
    showScreen('settings');
    // keep selects showing sane defaults every fresh visit is NOT forced;
    // user's last chosen values remain, which is expected UX.
  }

  if (action === 'go-toss') {
    const overs = clamp(readIntSelect('sel-overs', 5), 1, 50);
    const wickets = clamp(readIntSelect('sel-wickets', 5), 1, 10);
    const difficulty = readSelectValue('sel-difficulty', 'normal');
    state = freshState(overs, wickets, difficulty, 'Computer');
    $('#toss-settings-line').textContent = `${overs} over${overs === 1 ? '' : 's'} • ${wickets} wicket${wickets === 1 ? '' : 's'} • ${difficulty[0].toUpperCase()}${difficulty.slice(1)} difficulty`;
    resetTossUI();
    showScreen('toss');
  }

  if (action === 'rematch') { showScreen('settings'); }

  if (action === 'go-stats') { renderStatsScreen(); showScreen('stats'); }

  if (action === 'open-settings') { $('#settings-backdrop').classList.remove('hidden'); }
  if (action === 'close-settings') { $('#settings-backdrop').classList.add('hidden'); }
  if (action === 'toggle-sound') {
    prefs.sound = !prefs.sound;
    savePrefs(prefs);
    applySoundToggleUI();
    if (prefs.sound) sfx.click();
  }

  if (action === 'go-tournament-home') { showScreen('tournament-home'); }
  if (action === 'go-tournament-choice') { showScreen('tournament-choice'); }
  if (action === 'quit-match') {
    if (confirm('Quit this match? Your progress in it will be lost.')) {
      state = null;
      showScreen('home');
      renderHomeStats();
    }
  }
  if (action === 'tourney-create') { tourneyCreate(); }
  if (action === 'tourney-join') { tourneyJoin(); }
  if (action === 'copy-code') { copyRoomCode(); }
  if (action === 'tourney-play-match') { tourneyPlayMatch(); }
  if (action === 'tourney-continue') { tourneyContinue(); }
});

$$('.theme-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    prefs.theme = btn.dataset.theme;
    savePrefs(prefs);
    applyTheme();
  });
});

$$('#stats-tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => { statsActiveTab = tab.dataset.diff; renderStatsScreen(); });
});

$$('#settings-tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('#settings-tabs .tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    $$('.modal-panel').forEach((p) => p.classList.remove('active'));
    $(`#panel-${tab.dataset.panel}`).classList.add('active');
  });
});

applyTheme();
applySoundToggleUI();

window.HC_startOnlineTourneyBotMatch = function (opts) {
  state = freshState(opts.overs, opts.wickets, 'hard', opts.opponentName);
  state.onlineTournamentRef = opts.ref;
  resetTossUI();
  showScreen('toss');
};

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
    if (!state || state.locked) return;
    state.locked = true;
    const call = btn.dataset.call;
    $$('.call-btn[data-call]').forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    $$('.call-btn[data-call]').forEach((b) => (b.disabled = true));

    sfx.coin();
    const coin = $('#coin');
    const landsHeads = Math.random() < 0.5;
    const extraSpins = 4 + Math.floor(Math.random() * 3);
    const finalAngle = extraSpins * 360 + (landsHeads ? 0 : 180);
    coin.style.setProperty('--spin', `${finalAngle}deg`);
    coin.classList.remove('flipping');
    void coin.offsetWidth; // restart animation reliably
    coin.classList.add('flipping');

    setTimeout(() => {
      const result = landsHeads ? 'heads' : 'tails';
      const playerWon = result === call;
      $('#toss-result').textContent = playerWon
        ? `It's ${result.toUpperCase()}! You won the toss.`
        : `It's ${result.toUpperCase()}! ${state.opponentName} won the toss.`;

      if (playerWon) {
        $('#bat-bowl-row').classList.remove('hidden');
        state.locked = false;
      } else {
        const computerChoosesBat = Math.random() < 0.55;
        state.battingFirst = computerChoosesBat ? 'computer' : 'player';
        setTimeout(() => startInnings(), 900);
      }
    }, 1650);
  });
});

$$('.bat-bowl-row .call-btn[data-choice]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!state) return;
    const choice = btn.dataset.choice;
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
  $('#ball-commentary').innerHTML = '&nbsp;';
  const banner = $('#tourney-banner');
  if (state.tournamentPendingRef) {
    const t = state.tournament;
    banner.textContent = `${t.roundNames[t.roundIndex]} — vs ${state.opponentName}`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
  renderGame();
  setupBallButtons();
}

function setupBallButtons() {
  // Reset the hand display here (not in renderGame) so a revealed number
  // is never overwritten before the player has actually seen it.
  const handA = $('#hand-a');
  const handB = $('#hand-b');
  handA.textContent = '✊';
  handB.textContent = '✊';
  handA.classList.remove('reveal');
  handB.classList.remove('reveal');
  $('#hand-a-number').textContent = '';
  $('#hand-b-number').textContent = '';

  $$('.ball').forEach((b) => {
    b.disabled = false;
    b.classList.remove('picked');
    b.onclick = () => onPlayerPick(parseInt(b.dataset.n, 10), b);
  });
  state.locked = false;
}

function renderGame() {
  const battingKey = currentBattingSideKey();
  const isPlayerBatting = battingKey === 'player';
  const battingScore = state.score[battingKey];
  const totalBalls = state.overs * 6;

  $('#team-a-tag').textContent = state.opponentName;
  $('#team-b-tag').textContent = playerName();
  $('#team-a-role').textContent = battingKey === 'computer' ? 'Batting' : 'Bowling';
  $('#team-b-role').textContent = battingKey === 'player' ? 'Batting' : 'Bowling';

  $('#big-score').textContent = `${battingScore.runs}/${battingScore.wkts}`;
  const oversDone = (Math.floor(battingScore.balls / 6) + (battingScore.balls % 6) / 10).toFixed(1);
  $('#overs-line').textContent = `${oversDone} / ${state.overs}.0 ov`;

  $('#innings-banner').textContent = state.inningsNum === 1
    ? `Innings 1 — ${isPlayerBatting ? 'You are batting' : `${state.opponentName} is batting`}`
    : `Innings 2 — ${isPlayerBatting ? 'You are batting' : `${state.opponentName} is batting`}`;

  const targetLine = $('#target-line');
  if (state.inningsNum === 2 && state.target !== null) {
    targetLine.classList.remove('hidden');
    const need = state.target - battingScore.runs;
    targetLine.textContent = need > 0
      ? `Target ${state.target} — need ${need} off ${Math.max(0, totalBalls - battingScore.balls)} balls`
      : 'Target reached!';
  } else {
    targetLine.classList.add('hidden');
  }

  $('#hand-a-label').textContent = state.opponentName;
  $('#hand-b-label').textContent = playerName();

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

/* ---- adaptive AI ----
   Bots only ever pick from {3,4,5,6} — never 0, 1 or 2.
   Bowling and batting each have their own strategy per difficulty:
     'random'  = ignores the human's pattern entirely
     'avoid'   = steers AWAY from the human's likely number
                 (forgiving when bowling = fewer cheap wickets;
                  safe when batting = hard to dismiss)
     'predict' = steers TOWARD the human's likely number
                 (aggressive wicket-hunting when bowling;
                  risky/exposed when batting)
*/
/* ---- adaptive AI ----
   Bots only ever pick from {3,4,5,6} — never 0, 1 or 2.
   Bowling and batting each have their own strategy per difficulty:
     'random'  = ignores the human's pattern entirely
     'avoid'   = steers AWAY from the human's likely number
                 (forgiving when bowling = fewer cheap wickets;
                  safe when batting = hard to dismiss)
     'predict' = steers TOWARD the human's likely number
                 (aggressive wicket-hunting when bowling;
                  risky/exposed when batting)
   On top of that:
     - weights are smoothed so no single guess ever becomes near-certain
       (that's what let people "solve" Hard by noticing it kept repeating
       one number)
     - the bot never repeats its own last pick three times running
     - in innings 2, the bot reads the required run-rate and gets more
       aggressive (batting) or more relentless (bowling, Hard only) when
       the chase is tight — simple situational awareness instead of a
       fixed strategy for the whole match
*/
const BOT_POOL = [3, 4, 5, 6];
const RECENCY_WINDOW = { easy: 3, normal: 4, hard: 8 };
const BOT_BOWL_STRATEGY = {
  easy:   { mode: 'avoid',   chance: 0.65 }, // rarely hunts wickets -> long, forgiving innings
  normal: { mode: 'avoid',   chance: 0.35 }, // a fair, competitive game
  hard:   { mode: 'predict', chance: 0.92 }, // hunts your pattern aggressively
};
const BOT_BAT_STRATEGY = {
  easy:   { mode: 'random',  chance: 0 },    // no special survival instinct
  normal: { mode: 'avoid',   chance: 0.30 }, // moderately hard to dismiss
  hard:   { mode: 'avoid',   chance: 0.92 }, // very hard to dismiss
};

function randomBotNumber(urgency) {
  // urgency: 1 = must score fast (bias toward 5/6), -1 = comfortably placed
  // (bias toward 3/4), 0 = no situational pressure, play evenly.
  if (urgency === 1) {
    const weighted = [3, 4, 5, 5, 6, 6, 6];
    return weighted[Math.floor(Math.random() * weighted.length)];
  }
  if (urgency === -1) {
    const weighted = [3, 3, 4, 4, 5, 6];
    return weighted[Math.floor(Math.random() * weighted.length)];
  }
  return BOT_POOL[Math.floor(Math.random() * BOT_POOL.length)];
}
function buildPoolWeights(freqArr, recentArr) {
  const w = BOT_POOL.map((n) => 1 + freqArr[n]);
  recentArr.forEach((n, idx) => {
    const poolIdx = BOT_POOL.indexOf(n);
    if (poolIdx === -1) return; // human's pick wasn't in the bot's own range — nothing to weight
    const recency = 1 + idx * 0.5; // later entries (more recent) weigh a lot more
    w[poolIdx] += recency;
  });
  // Smooth away extreme certainty: if one number's weight has run far ahead
  // of the others (e.g. the human played it six times in a row), compress
  // the spread with a square-root "temperature" so the bot stays a little
  // unpredictable instead of calcifying into "always guess the same number".
  const maxW = Math.max(...w);
  const minW = Math.min(...w);
  if (minW > 0 && maxW / minW > 4) return w.map((x) => Math.sqrt(x));
  return w;
}
function weightedPoolSample(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return BOT_POOL[i];
  }
  return BOT_POOL[weights.length - 1];
}

// How urgent is the chase, from the bot's point of view, right now?
// Only meaningful in innings 2 once a target exists.
function computeChaseUrgency(isPlayerBatting) {
  if (state.inningsNum !== 2 || state.target == null) return 0;
  const totalBalls = state.overs * 6;
  if (!isPlayerBatting) {
    // bot is batting (chasing the target itself)
    const s = state.score.computer;
    const ballsLeft = totalBalls - s.balls;
    if (ballsLeft <= 0) return 0;
    const requiredRate = (state.target - s.runs) / ballsLeft;
    if (requiredRate >= 1.15) return 1;
    if (requiredRate <= 0.4) return -1;
    return 0;
  }
  // bot is bowling, defending the target against the human's chase
  const s = state.score.player;
  const ballsLeft = totalBalls - s.balls;
  if (ballsLeft <= 0) return 0;
  const requiredRate = (state.target - s.runs) / ballsLeft;
  return requiredRate <= 0.4 ? 1 : 0; // human cruising -> bot must be maximally sharp
}

function pickComputerNumber(isPlayerBatting) {
  const diff = state.difficulty;
  const strategy = isPlayerBatting ? (BOT_BOWL_STRATEGY[diff] || BOT_BOWL_STRATEGY.normal) : (BOT_BAT_STRATEGY[diff] || BOT_BAT_STRATEGY.normal);
  const recWindow = RECENCY_WINDOW[diff] || 4;
  const urgency = computeChaseUrgency(isPlayerBatting);
  const botHistory = isPlayerBatting ? state.botBowlPicks : state.botBatPicks;

  let effectiveChance = strategy.chance;
  if (urgency === 1 && strategy.mode === 'predict') effectiveChance = Math.min(0.97, effectiveChance + 0.25);

  let choice;
  if (strategy.mode === 'random' || Math.random() > effectiveChance) {
    choice = randomBotNumber(!isPlayerBatting ? urgency : 0);
  } else {
    const freqArr = isPlayerBatting ? state.playerFreqBatting : state.playerFreqBowling;
    const recentArr = isPlayerBatting ? state.recentBatting : state.recentBowling;
    const weights = buildPoolWeights(freqArr, recentArr.slice(-recWindow));
    if (strategy.mode === 'predict') {
      choice = weightedPoolSample(weights);
    } else {
      const maxW = Math.max(...weights);
      const inverted = weights.map((w) => (maxW - w) + 1);
      choice = weightedPoolSample(inverted);
    }
  }

  // Never let the bot repeat the same number three times running — that
  // fixed, learnable rhythm was the exact exploit players were finding.
  if (botHistory.length >= 2 && botHistory[botHistory.length - 1] === choice && botHistory[botHistory.length - 2] === choice) {
    const alternatives = BOT_POOL.filter((n) => n !== choice);
    choice = alternatives[Math.floor(Math.random() * alternatives.length)];
  }
  botHistory.push(choice);
  if (botHistory.length > 12) botHistory.shift();
  return choice;
}

function numberEmoji(n) {
  const map = ['✊', '☝️', '✌️', '🤟', '🖖', '🖐️', '👐'];
  return map[n] || '✊';
}

function showToast(text, isWicket) {
  const t = $('#toast');
  t.textContent = text;
  t.className = 'toast show' + (isWicket ? ' wicket' : '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('show'), 1100);
}

function onPlayerPick(num, btnEl) {
  if (!state || state.locked) return;
  state.locked = true;
  sfx.click();

  $$('.ball').forEach((b) => (b.disabled = true));
  btnEl.classList.add('picked');

  const handA = $('#hand-a');
  const handB = $('#hand-b');
  handA.classList.add('shaking');
  handB.classList.add('shaking');
  $('#ball-commentary').innerHTML = '&nbsp;';

  const battingKey = currentBattingSideKey();
  const isPlayerBatting = battingKey === 'player';
  const compNum = pickComputerNumber(isPlayerBatting);

  if (isPlayerBatting) {
    state.playerFreqBatting[num] += 1;
    state.recentBatting.push(num);
    if (state.recentBatting.length > 10) state.recentBatting.shift();
  } else {
    state.playerFreqBowling[num] += 1;
    state.recentBowling.push(num);
    if (state.recentBowling.length > 10) state.recentBowling.shift();
  }

  setTimeout(() => {
    handA.classList.remove('shaking');
    handB.classList.remove('shaking');
    handA.classList.add('reveal');
    handB.classList.add('reveal');
    handA.textContent = numberEmoji(compNum);
    handB.textContent = numberEmoji(num);
    $('#hand-a-number').textContent = compNum;
    $('#hand-b-number').textContent = num;

    resolveBall(num, compNum, isPlayerBatting);
  }, 650);
}

function resolveBall(playerNum, compNum, isPlayerBatting) {
  const battingKey = currentBattingSideKey();
  const batterNum = isPlayerBatting ? playerNum : compNum;
  const bowlerNum = isPlayerBatting ? compNum : playerNum;
  const isWicket = batterNum === bowlerNum;
  const runs = isWicket ? 0 : batterNum;

  const s = state.score[battingKey];
  s.balls += 1;
  if (isWicket) s.wkts += 1; else s.runs += runs;

  state.thisOverPips.push({ isWicket, runs });

  const batterLabel = isPlayerBatting ? 'You' : state.opponentName;
  const bowlerLabel = isPlayerBatting ? state.opponentName : 'You';
  let commentary;
  if (isWicket) {
    commentary = `Both showed ${batterNum} — ${batterLabel} is OUT!`;
    showToast('OUT!', true);
    sfx.wicket();
  } else if (runs === 6) {
    commentary = `${bowlerLabel} showed ${bowlerNum}, ${batterLabel} showed ${batterNum} — SIX!`;
    showToast('SIX! 🚀', false);
    sfx.six();
  } else if (runs === 4) {
    commentary = `${bowlerLabel} showed ${bowlerNum}, ${batterLabel} showed ${batterNum} — FOUR!`;
    showToast('FOUR!', false);
    sfx.four();
  } else {
    commentary = `${bowlerLabel} showed ${bowlerNum}, ${batterLabel} showed ${batterNum} → ${runs} run${runs === 1 ? '' : 's'}`;
  }
  $('#ball-commentary').textContent = commentary;

  // update score / overs text but hands keep showing the just-revealed numbers
  const battingScore = state.score[battingKey];
  $('#big-score').textContent = `${battingScore.runs}/${battingScore.wkts}`;
  const totalBalls = state.overs * 6;
  const oversDone = (Math.floor(battingScore.balls / 6) + (battingScore.balls % 6) / 10).toFixed(1);
  $('#overs-line').textContent = `${oversDone} / ${state.overs}.0 ov`;
  if (state.inningsNum === 2 && state.target !== null) {
    const need = state.target - battingScore.runs;
    $('#target-line').textContent = need > 0
      ? `Target ${state.target} — need ${need} off ${Math.max(0, totalBalls - battingScore.balls)} balls`
      : 'Target reached!';
  }
  renderThisOver();
  if (state.thisOverPips.length >= 6) {
    setTimeout(() => { state.thisOverPips = []; renderThisOver(); }, 1200);
  }

  const holdTime = isWicket || runs >= 4 ? 1300 : 950;
  setTimeout(() => {
    if (checkInningsEnd()) {
      handleInningsEnd();
    } else {
      setupBallButtons();
    }
  }, holdTime);
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
    $('#ball-commentary').innerHTML = '&nbsp;';
    setTimeout(() => { renderGame(); setupBallButtons(); }, 1400);
  } else {
    finishMatch();
  }
}

function finishMatch() {
  const firstKey = state.battingFirst;
  const secondKey = firstKey === 'player' ? 'computer' : 'player';
  const firstRuns = state.score[firstKey].runs;
  const secondRuns = state.score[secondKey].runs;

  let title, outcome; // outcome: 'win' | 'lose' | 'tie'
  if (secondRuns > firstRuns) {
    const wicketsInHand = state.wickets - state.score[secondKey].wkts;
    const winnerName = secondKey === 'player' ? playerName() : state.opponentName;
    title = `${winnerName} won by ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'}!`;
    outcome = secondKey === 'player' ? 'win' : 'lose';
  } else if (secondRuns < firstRuns) {
    const margin = firstRuns - secondRuns;
    const winnerName = firstKey === 'player' ? playerName() : state.opponentName;
    title = `${winnerName} won by ${margin} run${margin === 1 ? '' : 's'}!`;
    outcome = firstKey === 'player' ? 'win' : 'lose';
  } else {
    title = "It's a tie!";
    outcome = 'tie';
  }

  // -- persist stats --
  let bucket;
  if (state.onlineTournamentRef) bucket = 'tournamentOnline';
  else if (state.tournamentPendingRef) bucket = 'tournamentAI';
  else bucket = state.difficulty;
  recordMatchStats(bucket, {
    outcome,
    runsScored: state.score.player.runs,
    ballsFaced: state.score.player.balls,
    wicketsTaken: state.score.computer.wkts,
    runsConceded: state.score.computer.runs,
  });

  if (outcome === 'win') sfx.win();

  const sub = `${firstKey === 'player' ? playerName() : state.opponentName} scored ${firstRuns}/${state.score[firstKey].wkts} — ` +
              `${secondKey === 'player' ? playerName() : state.opponentName} scored ${secondRuns}/${state.score[secondKey].wkts}`;

  $('#result-emoji').textContent = outcome === 'win' ? '🏆' : outcome === 'tie' ? '🤝' : '😔';
  $('#result-title').textContent = title;
  $('#result-sub').textContent = sub;
  $('#rs-innings1').textContent = `${firstRuns}/${state.score[firstKey].wkts}`;
  $('#rs-innings2').textContent = `${secondRuns}/${state.score[secondKey].wkts}`;

  if (state.onlineTournamentRef) {
    if (typeof window.HC_reportOnlineTourneyMatch === 'function') {
      window.HC_reportOnlineTourneyMatch(state.onlineTournamentRef, {
        outcome,
        playerRuns: state.score.player.runs,
        playerWkts: state.score.player.wkts,
        oppRuns: state.score.computer.runs,
        oppWkts: state.score.computer.wkts,
      });
    }
    $('#result-actions-normal').classList.add('hidden');
    $('#result-actions-tourney').classList.add('hidden');
    $('#result-actions-online-tourney').classList.remove('hidden');
  } else if (state.tournamentPendingRef) {
    applyTournamentMatchResult(outcome);
    $('#result-actions-normal').classList.add('hidden');
    $('#result-actions-online-tourney').classList.add('hidden');
    $('#result-actions-tourney').classList.remove('hidden');
  } else {
    $('#result-actions-normal').classList.remove('hidden');
    $('#result-actions-tourney').classList.add('hidden');
    $('#result-actions-online-tourney').classList.add('hidden');
  }

  showScreen('result');
}

/* ==========================================================
   TOURNAMENT ENGINE (local knockout, room code = deterministic seed)
   ========================================================== */
const TEAM_NAME_POOL = [
  'Iron Fist XI', 'Thunder Claws', 'Silent Assassins', 'Ball Busters', 'The Googlies',
  'Doosra Devils', 'Yorker Yodhas', 'Midnight Sixers', 'Chinaman Chargers', 'Stone Hands',
  'Reverse Swing Co.', 'The Duckworth Lewis', 'Slip Cordon', 'Cover Drive Kings', 'Bouncer Boys',
  'Full Toss Legends', 'Wide Awake XI', 'No Ball Nomads', 'Death Over Dragons', 'Powerplay Panthers',
  'Spin Doctors', 'Pace Battery', 'Boundary Riders', 'Gully Warriors', 'Maiden Over Mafia',
];

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function roundNamesForSize(size) {
  return size === 16 ? ['Round of 16', 'Quarterfinal', 'Semifinal', 'Final'] : ['Quarterfinal', 'Semifinal', 'Final'];
}
function quickSimScore(overs, wickets) {
  const runs = Math.max(0, Math.round(overs * 6 * (0.5 + Math.random() * 1.3)));
  const wkts = Math.min(wickets, Math.floor(Math.random() * (wickets + 1)));
  return { runs, wkts };
}
function simulateBotMatch(overs, wickets) {
  const a = quickSimScore(overs, wickets);
  let b = quickSimScore(overs, wickets);
  if (a.runs === b.runs) b.runs += 1;
  return { scoreA: a, scoreB: b, winnerIsA: a.runs > b.runs };
}
function autoSimRound(matches, overs, wickets) {
  matches.forEach((m) => {
    if (m.done) return;
    if (m.sideA.isPlayer || m.sideB.isPlayer) return; // leave the player's match pending
    const res = simulateBotMatch(overs, wickets);
    m.scoreA = res.scoreA; m.scoreB = res.scoreB;
    m.winner = res.winnerIsA ? 'A' : 'B';
    m.done = true;
  });
}
function buildRoundFromEntrants(entrants) {
  const matches = [];
  for (let i = 0; i < entrants.length; i += 2) {
    matches.push({ sideA: entrants[i], sideB: entrants[i + 1], done: false, winner: null, scoreA: null, scoreB: null });
  }
  return matches;
}
function winnersOf(matches) {
  return matches.map((m) => (m.winner === 'A' ? m.sideA : m.sideB));
}

function tourneyCreate() {
  const size = readIntSelect('sel-tourney-size', 8) === 16 ? 16 : 8;
  const overs = clamp(readIntSelect('sel-tourney-overs', 2), 1, 20);
  const wickets = clamp(readIntSelect('sel-tourney-wickets', 2), 1, 10);
  const difficulty = readSelectValue('sel-tourney-difficulty', 'normal');
  const code = randomRoomCode();
  buildTournament(code, size, overs, wickets, difficulty);
}
function tourneyJoin() {
  const raw = ($('#join-code-input').value || '').trim().toUpperCase();
  if (!raw) { showToast('Enter a code first', false); return; }
  const size = readIntSelect('sel-tourney-size', 8) === 16 ? 16 : 8;
  const overs = clamp(readIntSelect('sel-tourney-overs', 2), 1, 20);
  const wickets = clamp(readIntSelect('sel-tourney-wickets', 2), 1, 10);
  const difficulty = readSelectValue('sel-tourney-difficulty', 'normal');
  buildTournament(raw, size, overs, wickets, difficulty);
}
function buildTournament(code, size, overs, wickets, difficulty) {
  if (!state) state = {}; // Tournament can be opened before any normal match is played
  const rng = mulberry32(hashCode(code));
  const botNames = seededShuffle(TEAM_NAME_POOL, rng).slice(0, size - 1);
  const entrants = [{ name: playerName(), isPlayer: true }, ...botNames.map((n) => ({ name: n, isPlayer: false }))];
  const shuffledEntrants = seededShuffle(entrants, rng);

  const round0 = buildRoundFromEntrants(shuffledEntrants);
  autoSimRound(round0, overs, wickets);

  state.tournament = {
    code, size, overs, wickets, difficulty,
    roundIndex: 0,
    roundNames: roundNamesForSize(size),
    rounds: [round0],
    champion: null,
    eliminated: false,
  };
  recordTournamentStarted('tournamentAI');
  state.tournament.statsRecorded = false;
  renderTournamentBracket();
  showScreen('tournament-bracket');
}

function findPlayerPendingMatch() {
  const t = state.tournament;
  if (!t) return null;
  const round = t.rounds[t.roundIndex];
  for (let i = 0; i < round.length; i++) {
    const m = round[i];
    if (!m.done && (m.sideA.isPlayer || m.sideB.isPlayer)) return { roundIndex: t.roundIndex, matchIndex: i, match: m };
  }
  return null;
}

function renderTournamentBracket() {
  const t = state.tournament;
  if (!t) return;
  $('#tourney-code-display').textContent = t.code;
  const wrap = $('#bracket-wrap');
  wrap.innerHTML = '';

  t.rounds.forEach((round, rIdx) => {
    const roundDiv = document.createElement('div');
    roundDiv.className = 'bracket-round';
    const h3 = document.createElement('h3');
    h3.textContent = t.roundNames[rIdx] || `Round ${rIdx + 1}`;
    roundDiv.appendChild(h3);

    round.forEach((m) => {
      const mDiv = document.createElement('div');
      const isLive = !m.done && (m.sideA.isPlayer || m.sideB.isPlayer);
      mDiv.className = 'bracket-match' + (m.done ? '' : ' pending') + (isLive ? ' live' : '');

      [['A', m.sideA, m.scoreA], ['B', m.sideB, m.scoreB]].forEach(([tag, side, score]) => {
        const sDiv = document.createElement('div');
        let cls = 'bracket-side';
        if (side.isPlayer) cls += ' you';
        if (m.done) cls += m.winner === tag ? ' winner' : ' eliminated';
        sDiv.className = cls;
        const scoreText = score ? `${score.runs}/${score.wkts}` : '';
        sDiv.innerHTML = `<span>${side.name}${side.isPlayer ? ' (You)' : ''}</span><span>${scoreText}</span>`;
        mDiv.appendChild(sDiv);
      });
      roundDiv.appendChild(mDiv);
    });
    wrap.appendChild(roundDiv);
  });

  const pending = findPlayerPendingMatch();
  const playBtn = $('#tourney-play-btn');
  const champBanner = $('#champion-banner');
  if (t.champion) {
    playBtn.classList.add('hidden');
    champBanner.classList.remove('hidden');
    const youWon = t.champion.isPlayer;
    champBanner.textContent = youWon
      ? `🏆 ${playerName()} is the Tournament Champion!`
      : `🏆 ${t.champion.name} wins the tournament. ${t.eliminated ? 'Better luck next time!' : ''}`;
  } else if (pending) {
    playBtn.classList.remove('hidden');
    champBanner.classList.add('hidden');
  } else {
    playBtn.classList.add('hidden');
    champBanner.classList.add('hidden');
  }
}

function copyRoomCode() {
  const code = state.tournament ? state.tournament.code : '';
  if (!code) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => showToast('Code copied!', false)).catch(() => {});
  } else {
    showToast(code, false);
  }
}

function tourneyPlayMatch() {
  const pending = findPlayerPendingMatch();
  if (!pending) return;
  const t = state.tournament;
  const opponentSide = pending.match.sideA.isPlayer ? pending.match.sideB : pending.match.sideA;

  state = freshState(t.overs, t.wickets, t.difficulty, opponentSide.name);
  state.tournament = t;
  state.tournamentPendingRef = pending;

  $('#toss-settings-line').textContent = `${t.roundNames[t.roundIndex]} • ${t.overs} over${t.overs === 1 ? '' : 's'} • ${t.wickets} wicket${t.wickets === 1 ? '' : 's'}`;
  resetTossUI();
  showScreen('toss');
}

function applyTournamentMatchResult(outcome) {
  const t = state.tournament;
  const ref = state.tournamentPendingRef;
  const match = t.rounds[ref.roundIndex][ref.matchIndex];
  const playerIsA = match.sideA.isPlayer;
  const playerScore = { runs: state.score.player.runs, wkts: state.score.player.wkts };
  const oppScore = { runs: state.score.computer.runs, wkts: state.score.computer.wkts };

  if (playerIsA) { match.scoreA = playerScore; match.scoreB = oppScore; }
  else { match.scoreB = playerScore; match.scoreA = oppScore; }

  let playerWinsMatch;
  if (outcome === 'tie') {
    playerWinsMatch = Math.random() < 0.5; // knockout tie-break, abstracted as a super over
  } else {
    playerWinsMatch = outcome === 'win';
  }
  match.winner = playerWinsMatch ? (playerIsA ? 'A' : 'B') : (playerIsA ? 'B' : 'A');
  match.done = true;

  if (!playerWinsMatch) {
    t.eliminated = true;
    fastForwardRestOfBracket();
  }
}

function fastForwardRestOfBracket() {
  const t = state.tournament;
  let currentRound = t.rounds[t.rounds.length - 1];
  // make sure the round we just finished is fully resolved (it will be, since player match just got 'done')
  while (currentRound.length > 1 || currentRound.some((m) => !m.done)) {
    autoSimRound(currentRound, t.overs, t.wickets); // resolves any leftover (shouldn't be any once player is out)
    if (currentRound.some((m) => !m.done)) break; // safety guard, should not happen
    const winners = winnersOf(currentRound);
    if (winners.length === 1) { t.champion = winners[0]; return; }
    const nextRound = buildRoundFromEntrants(winners);
    autoSimRound(nextRound, t.overs, t.wickets);
    t.rounds.push(nextRound);
    t.roundIndex = t.rounds.length - 1;
    currentRound = nextRound;
  }
  const winners = winnersOf(currentRound);
  if (winners.length === 1) t.champion = winners[0];
}

function tourneyContinue() {
  const t = state.tournament;
  if (t.eliminated) {
    renderTournamentBracket();
    showScreen('tournament-bracket');
    return;
  }
  const currentRound = t.rounds[t.roundIndex];
  if (currentRound.every((m) => m.done)) {
    const winners = winnersOf(currentRound);
    if (winners.length === 1) {
      t.champion = winners[0];
      if (t.champion.isPlayer && !t.statsRecorded) { recordTournamentWon('tournamentAI'); t.statsRecorded = true; }
    } else {
      const nextRound = buildRoundFromEntrants(winners);
      autoSimRound(nextRound, t.overs, t.wickets);
      t.rounds.push(nextRound);
      t.roundIndex = t.rounds.length - 1;
    }
  }
  renderTournamentBracket();
  showScreen('tournament-bracket');
}
