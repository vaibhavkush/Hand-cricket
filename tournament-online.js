/* ============================================================
   TOURNAMENT — Vs Real Players (online, Firebase-backed)
   8 or 16 entrants, single-elimination. Real players join with
   a room code; empty slots are filled with Hard-mode bots when
   the host starts. Every match is 1v1 and can be played whenever
   the people in it are ready — real-vs-real matches sync live
   over Firebase (same transaction pattern as the 1v1 Online Room),
   real-vs-bot matches are played locally against the existing
   single-player engine and the result is reported back here.
   ============================================================ */

(function () {
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  const FORFEIT_WINDOW_MS = 90 * 1000; // how long a match-starter waits before they can claim a walkover

  const TO = {
    db: null, ready: false,
    code: null, playerId: null, playerName: null, isHost: false,
    unsub: null, matchUnsub: null, activeMatchPath: null,
    activeMatch: null, // {roundIndex, matchIndex, match}
    room: null,
    suspendRender: false,
    lastRenderedBallSeq: -1,
    statsRecordedFor: null,
  };

  function setStatus(msg) { const el = qs('#to-status-line'); if (el) el.textContent = msg; }

  function initFirebase() {
    if (TO.ready) return true;
    if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY_HERE') {
      setStatus('Firebase is not set up yet — see README.');
      return false;
    }
    if (typeof firebase === 'undefined') { setStatus('Firebase SDK failed to load — check your internet connection.'); return false; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      TO.db = firebase.database();
      TO.ready = true;
      return true;
    } catch (e) { console.error(e); setStatus('Could not connect: ' + e.message); return false; }
  }

  function randomId() { return 'p_' + Math.random().toString(36).slice(2, 10); }
  function randomRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  }
  function currentPlayerName() {
    const el = qs('#player-name');
    return (el && el.value ? el.value.trim() : '') || 'Player';
  }
  function roomKey(code) { return `handcricket_troom_${code}_playerid`; }
  function getSavedId(code) { try { return localStorage.getItem(roomKey(code)); } catch (e) { return null; } }
  function saveId(code, id) { try { localStorage.setItem(roomKey(code), id); } catch (e) { /* ignore */ } }

  const BOT_NAME_POOL = [
    'Iron Fist XI', 'Thunder Claws', 'Silent Assassins', 'Ball Busters', 'The Googlies',
    'Doosra Devils', 'Yorker Yodhas', 'Midnight Sixers', 'Chinaman Chargers', 'Stone Hands',
    'Reverse Swing Co.', 'The Duckworth Lewis', 'Slip Cordon', 'Cover Drive Kings', 'Bouncer Boys',
    'Full Toss Legends',
  ];
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function roundNamesForSize(size) {
    return size === 16 ? ['Round of 16', 'Quarterfinal', 'Semifinal', 'Final'] : ['Quarterfinal', 'Semifinal', 'Final'];
  }
  function numberEmoji(n) {
    const map = ['✊', '☝️', '✌️', '🤟', '🖖', '🖐️', '👐'];
    return map[n] || '✊';
  }
  function sideNameById(found, id) {
    if (id === TO.playerId) return TO.playerName;
    return found.match.sideA.id === id ? found.match.sideA.name : found.match.sideB.name;
  }
  function showScreenSafe(name) {
    qsa('.screen').forEach((s) => s.classList.remove('active'));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }

  /* ---------------- create / join ---------------- */
  async function createTournament() {
    if (!initFirebase()) return;
    const btn = document.querySelector('[data-action="to-create"]');
    if (btn) btn.disabled = true;
    setStatus('Creating…');
    const size = parseInt(qs('#sel-to-size').value, 10) === 16 ? 16 : 8;
    const overs = parseInt(qs('#sel-to-overs').value, 10) || 2;
    const wickets = parseInt(qs('#sel-to-wickets').value, 10) || 2;
    const code = randomRoomCode();
    const playerId = randomId();
    const name = currentPlayerName();
    try {
      await TO.db.ref(`tournamentRooms/${code}/meta`).set({
        size, overs, wickets, status: 'lobby', hostId: playerId,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
      });
      await TO.db.ref(`tournamentRooms/${code}/players/${playerId}`).set({
        name, joinedAt: firebase.database.ServerValue.TIMESTAMP,
      });
      saveId(code, playerId);
      TO.code = code; TO.playerId = playerId; TO.playerName = name; TO.isHost = true;
      enterLobby();
    } catch (e) {
      console.error(e);
      setStatus('Could not create: ' + e.message + ' (check your Realtime Database rules)');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function joinTournament() {
    if (!initFirebase()) return;
    const code = (qs('#to-join-code').value || '').trim().toUpperCase();
    if (!code) { setStatus('Enter a code first.'); return; }
    const btn = document.querySelector('[data-action="to-join"]');
    if (btn) btn.disabled = true;
    setStatus('Joining…');
    try {
      const metaSnap = await TO.db.ref(`tournamentRooms/${code}/meta`).once('value');
      const meta = metaSnap.val();
      if (!meta) { setStatus('No tournament found with that code.'); return; }

      const existingId = getSavedId(code);
      if (existingId) {
        const exSnap = await TO.db.ref(`tournamentRooms/${code}/players/${existingId}`).once('value');
        if (exSnap.exists()) {
          const freshName = currentPlayerName();
          if (exSnap.val().name !== freshName) {
            await TO.db.ref(`tournamentRooms/${code}/players/${existingId}/name`).set(freshName);
          }
          TO.code = code; TO.playerId = existingId; TO.playerName = freshName; TO.isHost = (meta.hostId === existingId);
          if (meta.status === 'lobby') enterLobby(); else enterBracket();
          return;
        }
      }

      if (meta.status !== 'lobby') {
        // tournament already running — join as a spectator (view-only, can't be paired into a match)
        TO.code = code; TO.playerId = randomId(); TO.playerName = currentPlayerName(); TO.isHost = false;
        enterBracket();
        return;
      }

      const playerId = randomId();
      const name = currentPlayerName();
      await TO.db.ref(`tournamentRooms/${code}/players/${playerId}`).set({
        name, joinedAt: firebase.database.ServerValue.TIMESTAMP,
      });
      saveId(code, playerId);
      TO.code = code; TO.playerId = playerId; TO.playerName = name; TO.isHost = false;
      enterLobby();
    } catch (e) {
      console.error(e);
      setStatus('Could not join: ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------------- lobby / room listener ---------------- */
  function enterLobby() {
    qs('#to-code-display').textContent = TO.code;
    showScreenSafe('to-lobby');
    listenRoom();
  }
  function enterBracket() {
    showScreenSafe('to-bracket');
    listenRoom();
  }
  function listenRoom() {
    detachListener();
    const ref = TO.db.ref(`tournamentRooms/${TO.code}`);
    TO.unsub = ref.on('value', (snap) => {
      const room = snap.val();
      if (!room) return;
      TO.room = room;
      if (TO.suspendRender) return; // user is off playing their own match right now
      if (room.meta.status === 'lobby') renderLobby(room);
      else renderBracketScreen(room);
    });
  }
  function detachListener() {
    if (TO.unsub && TO.code) TO.db.ref(`tournamentRooms/${TO.code}`).off('value', TO.unsub);
    TO.unsub = null;
  }
  function detachMatchListener() {
    if (TO.matchUnsub && TO.activeMatchPath) TO.db.ref(TO.activeMatchPath).off('value', TO.matchUnsub);
    TO.matchUnsub = null; TO.activeMatchPath = null;
  }

  function renderLobby(room) {
    const players = room.players || {};
    const size = room.meta.size;
    const ids = Object.keys(players).sort((a, b) => (players[a].joinedAt || 0) - (players[b].joinedAt || 0));
    const wrap = qs('#to-lobby-players');
    wrap.innerHTML = ids.map((id, idx) => `
      <div class="player-chip${id === TO.playerId ? ' me' : ''}">
        ${players[id].name}${id === room.meta.hostId ? ' 👑' : ''}${id === TO.playerId ? ' (you)' : ''}
        ${idx >= size ? '<span class="spectator-tag">extra — spectator</span>' : ''}
      </div>
    `).join('') || '<p class="mini-note">No one here yet.</p>';

    const startBtn = qs('#to-start-btn');
    if (TO.isHost && ids.length >= 2) {
      startBtn.classList.remove('hidden');
      qs('#to-lobby-note').textContent = `${ids.length} joined (target ${size}). Empty slots fill with Hard-mode bots when you start.`;
    } else if (TO.isHost) {
      startBtn.classList.add('hidden');
      qs('#to-lobby-note').textContent = 'Share this code. Need at least 2 players to start.';
    } else {
      startBtn.classList.add('hidden');
      qs('#to-lobby-note').textContent = 'Waiting for the host to start the tournament…';
    }
  }

  /* ---------------- bracket build ---------------- */
  function quickSimScore(overs, wickets) {
    const runs = Math.max(0, Math.round(overs * 6 * (0.5 + Math.random() * 1.3)));
    const wkts = Math.min(wickets, Math.floor(Math.random() * (wickets + 1)));
    return { runs, wkts };
  }
  function autoResolveBotMatch(m, overs, wickets) {
    const a = quickSimScore(overs, wickets);
    let b = quickSimScore(overs, wickets);
    if (a.runs === b.runs) b.runs += 1;
    m.scoreA = a; m.scoreB = b; m.winner = a.runs > b.runs ? 'A' : 'B'; m.status = 'done';
  }

  async function startTournament() {
    if (!TO.isHost) return;
    const roomSnap = await TO.db.ref(`tournamentRooms/${TO.code}`).once('value');
    const room = roomSnap.val();
    const size = room.meta.size;
    const playersObj = room.players || {};
    const ids = Object.keys(playersObj).sort((a, b) => (playersObj[a].joinedAt || 0) - (playersObj[b].joinedAt || 0));
    const realIds = ids.slice(0, size); // anyone beyond `size` stays a spectator
    let entrants = realIds.map((id) => ({ id, name: playersObj[id].name, isBot: false }));
    const needed = size - entrants.length;
    if (needed > 0) {
      const bots = shuffle(BOT_NAME_POOL).slice(0, needed).map((n) => ({ id: null, name: n, isBot: true }));
      entrants = entrants.concat(bots);
    }
    entrants = shuffle(entrants);

    const round0 = [];
    for (let i = 0; i < entrants.length; i += 2) {
      const a = entrants[i], b = entrants[i + 1];
      const bothReal = !a.isBot && !b.isBot;
      round0.push({
        sideA: a, sideB: b,
        hostId: bothReal ? a.id : null,
        status: 'pending', scoreA: null, scoreB: null, winner: null,
      });
    }
    round0.forEach((m) => { if (m.sideA.isBot && m.sideB.isBot) autoResolveBotMatch(m, room.meta.overs, room.meta.wickets); });

    await TO.db.ref(`tournamentRooms/${TO.code}/meta/status`).set('active');
    await TO.db.ref(`tournamentRooms/${TO.code}/bracket`).set({
      roundIndex: 0,
      roundNames: roundNamesForSize(size),
      rounds: [round0],
      champion: null,
    });
    if (typeof window.HC_recordTournamentStarted === 'function') window.HC_recordTournamentStarted('tournamentOnline');
  }

  function tryAdvanceRound() {
    if (!TO.code) return;
    const bracketRef = TO.db.ref(`tournamentRooms/${TO.code}/bracket`);
    let justCrownedPlayerChampion = false;
    bracketRef.transaction((b) => {
      justCrownedPlayerChampion = false; // reset on every attempt (transactions can retry)
      if (!b || b.champion) return b;
      const round = b.rounds[b.roundIndex];
      const allDone = round.every((m) => m.status === 'done' || m.status === 'forfeited');
      if (!allDone) return; // nothing to do yet — abort with no change
      if (b.rounds.length > b.roundIndex + 1) return; // someone else already built the next round
      const winners = round.map((m) => (m.winner === 'A' ? m.sideA : m.sideB));
      if (winners.length === 1) {
        b.champion = winners[0];
        if (winners[0].id === TO.playerId) justCrownedPlayerChampion = true;
        return b;
      }
      const nextRound = [];
      for (let i = 0; i < winners.length; i += 2) {
        const a = winners[i], bb = winners[i + 1];
        const bothReal = !a.isBot && !bb.isBot;
        nextRound.push({ sideA: a, sideB: bb, hostId: bothReal ? a.id : null, status: 'pending', scoreA: null, scoreB: null, winner: null });
      }
      const overs = TO.room ? TO.room.meta.overs : 2;
      const wickets = TO.room ? TO.room.meta.wickets : 2;
      nextRound.forEach((m) => { if (m.sideA.isBot && m.sideB.isBot) autoResolveBotMatch(m, overs, wickets); });
      b.rounds.push(nextRound);
      b.roundIndex = b.rounds.length - 1;
      return b;
    }).then((result) => {
      if (result && result.committed && justCrownedPlayerChampion && typeof window.HC_recordTournamentWon === 'function') {
        window.HC_recordTournamentWon('tournamentOnline');
      }
    }).catch((e) => console.error('advance round failed', e));
  }

  /* ---------------- bracket screen ---------------- */
  function findMyMatch(room) {
    if (!room.bracket) return null;
    const round = room.bracket.rounds[room.bracket.roundIndex];
    for (let i = 0; i < round.length; i++) {
      const m = round[i];
      if (m.sideA.id === TO.playerId || m.sideB.id === TO.playerId) return { roundIndex: room.bracket.roundIndex, matchIndex: i, match: m };
    }
    return null;
  }

  function renderBracketScreen(room) {
    showScreenSafe('to-bracket');
    qs('#to-bracket-code-display').textContent = TO.code;
    const bracket = room.bracket;
    if (!bracket) return;
    const wrap = qs('#to-bracket-wrap');
    wrap.innerHTML = '';
    bracket.rounds.forEach((round, rIdx) => {
      const roundDiv = document.createElement('div');
      roundDiv.className = 'bracket-round';
      const h3 = document.createElement('h3');
      h3.textContent = bracket.roundNames[rIdx] || `Round ${rIdx + 1}`;
      roundDiv.appendChild(h3);

      round.forEach((m) => {
        const mDiv = document.createElement('div');
        const involvesMe = m.sideA.id === TO.playerId || m.sideB.id === TO.playerId;
        const isPending = m.status !== 'done' && m.status !== 'forfeited';
        mDiv.className = 'bracket-match' + (isPending ? ' pending' : '') + (isPending && involvesMe ? ' live' : '');
        [['A', m.sideA, m.scoreA], ['B', m.sideB, m.scoreB]].forEach(([tag, side, score]) => {
          const sDiv = document.createElement('div');
          let cls = 'bracket-side';
          if (side.id === TO.playerId) cls += ' you';
          if (!isPending) cls += (m.winner === tag ? ' winner' : ' eliminated');
          sDiv.className = cls;
          const scoreText = score ? `${score.runs}/${score.wkts}` : '';
          const label = side.name + (side.id === TO.playerId ? ' (You)' : (side.isBot ? ' 🤖' : ''));
          sDiv.innerHTML = `<span>${label}</span><span>${scoreText}</span>`;
          mDiv.appendChild(sDiv);
        });
        roundDiv.appendChild(mDiv);
      });
      wrap.appendChild(roundDiv);
    });

    renderActionArea(room);
    tryAdvanceRound();
  }

  function renderActionArea(room) {
    const area = qs('#to-action-area');
    area.innerHTML = '';
    const champBanner = qs('#to-champion-banner');
    if (room.bracket.champion) {
      champBanner.classList.remove('hidden');
      const champ = room.bracket.champion;
      champBanner.textContent = champ.id === TO.playerId
        ? `🏆 ${TO.playerName} is the Tournament Champion!`
        : `🏆 ${champ.name} wins the tournament!`;
      return;
    }
    champBanner.classList.add('hidden');

    const found = findMyMatch(room);
    if (!found) return; // eliminated already, or spectating
    const m = found.match;
    if (m.status === 'done' || m.status === 'forfeited') {
      const p = document.createElement('p');
      p.className = 'mini-note';
      p.textContent = 'Waiting for the round to finish…';
      area.appendChild(p);
      return;
    }

    const oppSide = m.sideA.id === TO.playerId ? m.sideB : m.sideA;

    if (oppSide.isBot) {
      const btn = document.createElement('button');
      btn.className = 'primary-btn';
      btn.textContent = `Play your match (vs ${oppSide.name})`;
      btn.onclick = () => playBotFixture(found, room);
      area.appendChild(btn);
      return;
    }

    if (m.status === 'pending') {
      if (m.hostId === TO.playerId) {
        const btn = document.createElement('button');
        btn.className = 'primary-btn';
        btn.textContent = "Start match (whenever you're ready)";
        btn.onclick = () => startRealMatch(found);
        area.appendChild(btn);
      } else {
        const p = document.createElement('p');
        p.className = 'mini-note';
        p.textContent = `Waiting for ${oppSide.name} to start your match…`;
        area.appendChild(p);
      }
    } else if (m.status === 'in_progress') {
      const btn = document.createElement('button');
      btn.className = 'primary-btn';
      btn.textContent = 'Go to match';
      btn.onclick = () => enterRealMatchScreen(found);
      area.appendChild(btn);
    }
  }

  /* ---------------- bot-fixture (played via the local single-player engine) ---------------- */
  function playBotFixture(found, room) {
    const oppSide = found.match.sideA.id === TO.playerId ? found.match.sideB : found.match.sideA;
    if (typeof window.HC_startOnlineTourneyBotMatch === 'function') {
      TO.suspendRender = true;
      window.HC_startOnlineTourneyBotMatch({
        overs: room.meta.overs, wickets: room.meta.wickets, opponentName: oppSide.name,
        ref: { code: TO.code, roundIndex: found.roundIndex, matchIndex: found.matchIndex },
      });
    }
  }

  window.HC_reportOnlineTourneyMatch = function (ref, result) {
    if (!TO.db) return;
    const matchRef = TO.db.ref(`tournamentRooms/${ref.code}/bracket/rounds/${ref.roundIndex}/${ref.matchIndex}`);
    matchRef.transaction((m) => {
      if (!m || m.status === 'done' || m.status === 'forfeited') return m;
      const playerIsA = m.sideA.id === TO.playerId;
      const playerScore = { runs: result.playerRuns, wkts: result.playerWkts };
      const oppScore = { runs: result.oppRuns, wkts: result.oppWkts };
      if (playerIsA) { m.scoreA = playerScore; m.scoreB = oppScore; }
      else { m.scoreB = playerScore; m.scoreA = oppScore; }
      const playerWins = result.outcome === 'tie' ? Math.random() < 0.5 : result.outcome === 'win';
      m.winner = playerWins ? (playerIsA ? 'A' : 'B') : (playerIsA ? 'B' : 'A');
      m.status = 'done';
      return m;
    }).catch((e) => console.error(e));
  };

  /* ---------------- real-vs-real: start + live ball-by-ball ---------------- */
  function startRealMatch(found) {
    const m = found.match;
    const battingFirstId = Math.random() < 0.5 ? m.sideA.id : m.sideB.id;
    const bowlingFirstId = battingFirstId === m.sideA.id ? m.sideB.id : m.sideA.id;
    const matchPath = `tournamentRooms/${TO.code}/bracket/rounds/${found.roundIndex}/${found.matchIndex}`;
    TO.db.ref(matchPath).update({
      status: 'in_progress',
      battingId: battingFirstId, bowlingId: bowlingFirstId,
      overs: TO.room.meta.overs, wicketsLimit: TO.room.meta.wickets,
      inningsNum: 1, target: null,
      score: { [m.sideA.id]: { runs: 0, wkts: 0, balls: 0 }, [m.sideB.id]: { runs: 0, wkts: 0, balls: 0 } },
      currentBall: {}, ballSeq: 0, lastResult: null,
      startedAt: firebase.database.ServerValue.TIMESTAMP,
    }).then(() => enterRealMatchScreen(found)).catch((e) => console.error(e));
  }

  function enterRealMatchScreen(found) {
    TO.suspendRender = true;
    TO.activeMatch = found;
    TO.lastRenderedBallSeq = -1;
    showScreenSafe('to-game');
    const matchPath = `tournamentRooms/${TO.code}/bracket/rounds/${found.roundIndex}/${found.matchIndex}`;
    detachMatchListener();
    TO.activeMatchPath = matchPath;
    TO.matchUnsub = TO.db.ref(matchPath).on('value', (snap) => {
      const match = snap.val();
      if (!match) return;
      TO.activeMatch = { roundIndex: found.roundIndex, matchIndex: found.matchIndex, match: { sideA: match.sideA || found.match.sideA, sideB: match.sideB || found.match.sideB } };
      if (match.status === 'done' || match.status === 'forfeited') renderMatchResult(match);
      else renderMatchGame(match);
    });
  }

  function renderMatchGame(match) {
    const found = TO.activeMatch;
    const oppSide = found.match.sideA.id === TO.playerId ? found.match.sideB : found.match.sideA;
    const isPlayerBatting = match.battingId === TO.playerId;
    const battingScore = match.score[match.battingId] || { runs: 0, wkts: 0, balls: 0 };
    const totalBalls = match.overs * 6;

    qs('#to-game-banner').textContent = `${TO.room.bracket.roundNames[found.roundIndex]} — vs ${oppSide.name}`;
    qs('#to-team-a-tag').textContent = oppSide.name;
    qs('#to-team-b-tag').textContent = TO.playerName;
    qs('#to-team-a-role').textContent = match.battingId === oppSide.id ? 'Batting' : 'Bowling';
    qs('#to-team-b-role').textContent = isPlayerBatting ? 'Batting' : 'Bowling';
    qs('#to-big-score').textContent = `${battingScore.runs}/${battingScore.wkts}`;
    const oversDone = (Math.floor(battingScore.balls / 6) + (battingScore.balls % 6) / 10).toFixed(1);
    qs('#to-overs-line').textContent = `${oversDone} / ${match.overs}.0 ov`;
    qs('#to-innings-banner').textContent = `Innings ${match.inningsNum} — ${isPlayerBatting ? 'You are batting now' : 'You are bowling now'}`;
    qs('#to-hand-a-label').textContent = oppSide.name;
    qs('#to-hand-b-label').textContent = TO.playerName;

    const targetLine = qs('#to-target-line');
    if (match.inningsNum === 2 && match.target != null) {
      targetLine.classList.remove('hidden');
      const need = match.target - battingScore.runs;
      targetLine.textContent = need > 0 ? `Target ${match.target} — need ${need} off ${Math.max(0, totalBalls - battingScore.balls)} balls` : 'Target reached!';
    } else {
      targetLine.classList.add('hidden');
    }

    if (match.lastResult && match.lastResult.ballSeq !== TO.lastRenderedBallSeq) {
      TO.lastRenderedBallSeq = match.lastResult.ballSeq;
      const r = match.lastResult;
      const myNum = r.picks[TO.playerId];
      const oppNum = r.picks[oppSide.id];
      qs('#to-hand-b').textContent = numberEmoji(myNum);
      qs('#to-hand-a').textContent = numberEmoji(oppNum);
      qs('#to-hand-b-number').textContent = myNum;
      qs('#to-hand-a-number').textContent = oppNum;
      qs('#to-commentary').textContent = r.isWicket
        ? `Both showed ${r.batterNum} — OUT!`
        : `${sideNameById(found, r.battingId)} showed ${r.batterNum} → ${r.runs} run${r.runs === 1 ? '' : 's'}`;
    }

    const cb = match.currentBall || {};
    const alreadyPicked = TO.playerId in cb;
    qs('#to-pick-prompt').textContent = alreadyPicked ? 'Waiting for opponent…' : 'Pick your number';
    qsa('#to-ball-row .ball').forEach((b) => { b.disabled = alreadyPicked; });

    renderForfeitArea(match, oppSide);
    tryResolveMatchBall(found);
  }

  function renderForfeitArea(match, oppSide) {
    const area = qs('#to-forfeit-area');
    area.innerHTML = '';
    if ((match.ballSeq || 0) > 0) return; // already underway — no forfeit claim needed
    if (!match.startedAt) return;
    const elapsed = Date.now() - match.startedAt;
    if (elapsed < FORFEIT_WINDOW_MS) {
      const p = document.createElement('p');
      p.className = 'forfeit-note';
      const secsLeft = Math.ceil((FORFEIT_WINDOW_MS - elapsed) / 1000);
      p.textContent = `If ${oppSide.name} hasn't played a ball in ${secsLeft}s, you'll be able to claim a walkover.`;
      area.appendChild(p);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'forfeit-btn';
    btn.textContent = `Claim win — ${oppSide.name} didn't show up`;
    btn.onclick = claimForfeit;
    area.appendChild(btn);
  }

  function claimForfeit() {
    const found = TO.activeMatch;
    if (!found) return;
    const matchRef = TO.db.ref(`tournamentRooms/${TO.code}/bracket/rounds/${found.roundIndex}/${found.matchIndex}`);
    matchRef.transaction((m) => {
      if (!m || m.status !== 'in_progress') return m;
      if ((m.ballSeq || 0) > 0) return m;
      if (!m.startedAt || Date.now() - m.startedAt < FORFEIT_WINDOW_MS) return m;
      const playerIsA = m.sideA.id === TO.playerId;
      m.winner = playerIsA ? 'A' : 'B';
      m.status = 'forfeited';
      return m;
    }).catch((e) => console.error(e));
  }

  function tryResolveMatchBall(found) {
    const matchRef = TO.db.ref(`tournamentRooms/${TO.code}/bracket/rounds/${found.roundIndex}/${found.matchIndex}`);
    matchRef.transaction((m) => {
      if (!m || m.status !== 'in_progress') return m;
      const cb = m.currentBall || {};
      const battingId = m.battingId, bowlingId = m.bowlingId;
      if (!(battingId in cb) || !(bowlingId in cb)) return; // wait for both picks

      const batterNum = cb[battingId], bowlerNum = cb[bowlingId];
      const isWicket = batterNum === bowlerNum;
      const runs = isWicket ? 0 : batterNum;
      const s = m.score[battingId] || { runs: 0, wkts: 0, balls: 0 };
      s.balls += 1;
      if (isWicket) s.wkts += 1; else s.runs += runs;
      m.score[battingId] = s;
      m.ballSeq = (m.ballSeq || 0) + 1;
      m.lastResult = { battingId, batterNum, bowlerNum, isWicket, runs, ballSeq: m.ballSeq, picks: cb };
      m.currentBall = {};

      const totalBalls = m.overs * 6;
      const inningsOver = s.wkts >= m.wicketsLimit || s.balls >= totalBalls ||
        (m.inningsNum === 2 && m.target != null && s.runs >= m.target);

      if (inningsOver) {
        if (m.inningsNum === 1) {
          m.firstInningsRuns = s.runs; m.firstInningsWkts = s.wkts; m.firstBattingId = battingId;
          m.target = s.runs + 1; m.inningsNum = 2;
          const pb = m.battingId, pw = m.bowlingId;
          m.battingId = pw; m.bowlingId = pb;
        } else {
          const secondRuns = s.runs;
          const firstRuns = m.firstInningsRuns;
          if (secondRuns > firstRuns) m.winner = (battingId === m.sideA.id) ? 'A' : 'B';
          else if (secondRuns < firstRuns) m.winner = (m.firstBattingId === m.sideA.id) ? 'A' : 'B';
          else m.winner = Math.random() < 0.5 ? 'A' : 'B'; // tie -> coin toss, same as knockout convention elsewhere
          m.status = 'done';
        }
      }
      return m;
    }).catch((e) => console.error('resolve failed', e));
  }

  qsa('#to-ball-row .ball').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const found = TO.activeMatch;
      if (!found || !TO.code) return;
      const n = parseInt(btn.dataset.n, 10);
      await TO.db.ref(`tournamentRooms/${TO.code}/bracket/rounds/${found.roundIndex}/${found.matchIndex}/currentBall/${TO.playerId}`).set(n);
    });
  });

  function renderMatchResult(match) {
    detachMatchListener();
    showScreenSafe('to-result');
    const found = TO.activeMatch;
    const myTag = found.match.sideA.id === TO.playerId ? 'A' : 'B';
    const iWon = match.winner === myTag;

    let title, sub = '';
    if (match.status === 'forfeited') {
      title = iWon ? "Opponent didn't show up — you win!" : 'You forfeited this match.';
    } else {
      const secondRuns = match.score[match.battingId].runs;
      const firstRuns = match.firstInningsRuns;
      if (secondRuns > firstRuns) {
        const wIn = match.wicketsLimit - match.score[match.battingId].wkts;
        title = `${sideNameById(found, match.battingId)} won by ${wIn} wicket${wIn === 1 ? '' : 's'}!`;
      } else if (secondRuns < firstRuns) {
        const margin = firstRuns - secondRuns;
        title = `${sideNameById(found, match.firstBattingId)} won by ${margin} run${margin === 1 ? '' : 's'}!`;
      } else {
        title = "It's a tie — won on tiebreaker!";
      }
      sub = `${found.match.sideA.name} ${match.score[found.match.sideA.id].runs}/${match.score[found.match.sideA.id].wkts} — ` +
            `${found.match.sideB.name} ${match.score[found.match.sideB.id].runs}/${match.score[found.match.sideB.id].wkts}`;
    }
    qs('#to-result-emoji').textContent = iWon ? '🏆' : '😔';
    qs('#to-result-title').textContent = title;
    qs('#to-result-sub').textContent = sub;

    const matchKey = `${TO.code}-${found.roundIndex}-${found.matchIndex}`;
    if (match.status !== 'forfeited' && TO.statsRecordedFor !== matchKey && typeof window.HC_recordMatchStats === 'function') {
      TO.statsRecordedFor = matchKey;
      const myScore = match.score[TO.playerId] || { runs: 0, wkts: 0, balls: 0 };
      const oppId = found.match.sideA.id === TO.playerId ? found.match.sideB.id : found.match.sideA.id;
      const oppScore = match.score[oppId] || { runs: 0, wkts: 0, balls: 0 };
      const outcome = title.indexOf('tie') !== -1 ? 'tie' : (iWon ? 'win' : 'lose');
      window.HC_recordMatchStats('tournamentOnline', {
        outcome, runsScored: myScore.runs, ballsFaced: myScore.balls,
        wicketsTaken: oppScore.wkts, runsConceded: oppScore.runs,
      });
    }
  }

  /* ---------------- misc ---------------- */
  function leaveTournament() {
    detachListener(); detachMatchListener();
    TO.code = null; TO.playerId = null; TO.isHost = false; TO.suspendRender = false; TO.room = null;
  }
  async function quitMatchForfeit() {
    if (!confirm('Quit this match? Your opponent will be shown as the winner.')) return;
    const found = TO.activeMatch;
    if (found && TO.code) {
      const matchRef = TO.db.ref(`tournamentRooms/${TO.code}/bracket/rounds/${found.roundIndex}/${found.matchIndex}`);
      try {
        await matchRef.transaction((m) => {
          if (!m || m.status === 'done' || m.status === 'forfeited') return m;
          const playerIsA = m.sideA.id === TO.playerId;
          m.winner = playerIsA ? 'B' : 'A';
          m.status = 'forfeited';
          return m;
        });
      } catch (e) { console.error(e); }
    }
    TO.suspendRender = false;
    detachMatchListener();
    if (TO.room) renderBracketScreen(TO.room); else showScreenSafe('to-bracket');
  }
  function copyCode() {
    if (!TO.code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(TO.code).catch(() => {});
  }

  /* ---------------- wire up buttons ---------------- */
  document.body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'go-tourney-online-setup') { setStatus(''); showScreenSafe('to-setup'); }
    if (action === 'to-create') createTournament();
    if (action === 'to-join') joinTournament();
    if (action === 'to-start-tournament') startTournament();
    if (action === 'to-copy-code') copyCode();
    if (action === 'to-leave') { leaveTournament(); showScreenSafe('home'); }
    if (action === 'to-back-to-bracket') { TO.suspendRender = false; if (TO.room) renderBracketScreen(TO.room); }
    if (action === 'to-quit-match') quitMatchForfeit();
    if (action === 'online-tourney-back-to-bracket') { TO.suspendRender = false; if (TO.room) renderBracketScreen(TO.room); else showScreenSafe('to-bracket'); }
  });
})();
