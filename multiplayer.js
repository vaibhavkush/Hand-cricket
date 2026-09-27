/* ============================================================
   ONLINE ROOM — real-time 1v1 hand cricket over Firebase
   Two (or more) different devices load this same site, one
   creates a room (gets a code), the other joins with that code.
   All game state lives in Firebase Realtime Database, so both
   screens are always showing the SAME data — no more "my pick
   shows something different on the other phone".
   ============================================================ */

(function () {
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  const MP = {
    db: null,
    ready: false,
    roomCode: null,
    playerId: null,
    playerName: null,
    isHost: false,
    roomUnsub: null,
    lastRenderedBallSeq: -1,
    lastStatus: null,
    statsRecordedForCode: null,
  };

  function setStatusLine(msg) {
    const el = qs('#online-status-line');
    if (el) el.textContent = msg;
  }

  function initFirebaseIfNeeded() {
    if (MP.ready) return true;
    if (typeof FIREBASE_CONFIG === 'undefined') {
      setStatusLine('firebase-config.js not found — check index.html script order.');
      return false;
    }
    if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY_HERE') {
      setStatusLine('Firebase is not set up yet. Open firebase-config.js and paste your own project keys (see README).');
      return false;
    }
    if (typeof firebase === 'undefined') {
      setStatusLine('Firebase SDK failed to load — check your internet connection.');
      return false;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      MP.db = firebase.database();
      MP.ready = true;
      return true;
    } catch (e) {
      console.error(e);
      setStatusLine('Could not connect to Firebase: ' + e.message);
      return false;
    }
  }

  function randomId() {
    return 'p_' + Math.random().toString(36).slice(2, 10);
  }
  function randomRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function currentPlayerNameFromHome() {
    const el = qs('#player-name');
    return (el && el.value ? el.value.trim() : '') || 'Player';
  }

  /* ---------------- de-dupe: remember THIS browser's player id per room code ---------------- */
  function roomPlayerKey(code) { return `handcricket_room_${code}_playerid`; }
  function getSavedPlayerId(code) {
    try { return localStorage.getItem(roomPlayerKey(code)); } catch (e) { return null; }
  }
  function savePlayerId(code, id) {
    try { localStorage.setItem(roomPlayerKey(code), id); } catch (e) { /* ignore */ }
  }

  /* ---------------- create / join ---------------- */
  async function createRoom() {
    if (!initFirebaseIfNeeded()) return;
    const btn = document.querySelector('[data-action="online-create"]');
    if (btn) btn.disabled = true;
    setStatusLine('Creating room…');
    const overs = parseInt(qs('#sel-online-overs').value, 10) || 2;
    const wickets = parseInt(qs('#sel-online-wickets').value, 10) || 2;
    const code = randomRoomCode();
    const playerId = randomId();
    const name = currentPlayerNameFromHome();

    try {
      await MP.db.ref(`rooms/${code}/meta`).set({
        overs, wickets, status: 'lobby', hostId: playerId,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
      });
      await MP.db.ref(`rooms/${code}/players/${playerId}`).set({
        name, joinedAt: firebase.database.ServerValue.TIMESTAMP,
      });
      savePlayerId(code, playerId);
      MP.roomCode = code; MP.playerId = playerId; MP.playerName = name; MP.isHost = true;
      MP.statsRecordedForCode = null;
      enterLobby();
    } catch (e) {
      console.error(e);
      setStatusLine('Could not create room: ' + e.message + ' (check your Realtime Database rules)');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function joinRoom() {
    if (!initFirebaseIfNeeded()) return;
    const code = (qs('#online-join-code').value || '').trim().toUpperCase();
    if (!code) { setStatusLine('Enter a room code first.'); return; }
    const btn = document.querySelector('[data-action="online-join"]');
    if (btn) btn.disabled = true;
    setStatusLine('Joining…');
    try {
      const metaSnap = await MP.db.ref(`rooms/${code}/meta`).once('value');
      const meta = metaSnap.val();
      if (!meta) { setStatusLine('No room found with that code.'); return; }

      // Already joined this exact room earlier from this browser (or clicked Join
      // twice) — reuse the same player id instead of adding a second entry.
      const existingId = getSavedPlayerId(code);
      if (existingId) {
        const existingSnap = await MP.db.ref(`rooms/${code}/players/${existingId}`).once('value');
        if (existingSnap.exists()) {
          const freshName = currentPlayerNameFromHome();
          if (existingSnap.val().name !== freshName) {
            await MP.db.ref(`rooms/${code}/players/${existingId}/name`).set(freshName);
          }
          MP.roomCode = code; MP.playerId = existingId; MP.playerName = freshName; MP.isHost = (meta.hostId === existingId);
          MP.statsRecordedForCode = null;
          enterLobby();
          return;
        }
      }

      if (meta.status !== 'lobby') { setStatusLine('That match has already started.'); return; }

      const playerId = randomId();
      const name = currentPlayerNameFromHome();
      await MP.db.ref(`rooms/${code}/players/${playerId}`).set({
        name, joinedAt: firebase.database.ServerValue.TIMESTAMP,
      });
      savePlayerId(code, playerId);
      MP.roomCode = code; MP.playerId = playerId; MP.playerName = name; MP.isHost = false;
      MP.statsRecordedForCode = null;
      enterLobby();
    } catch (e) {
      console.error(e);
      setStatusLine('Could not join room: ' + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------------- lobby ---------------- */
  function enterLobby() {
    qs('#online-code-display').textContent = MP.roomCode;
    showScreenSafe('online-lobby');
    listenLobby();
  }

  function listenLobby() {
    detachRoomListener();
    const ref = MP.db.ref(`rooms/${MP.roomCode}`);
    MP.roomUnsub = ref.on('value', (snap) => {
      const room = snap.val();
      if (!room) return;
      MP.room = room;
      if (room.meta.status === 'lobby') renderLobby(room);
      else if (room.meta.status === 'toss') renderOnlineToss(room);
      else if (room.meta.status === 'playing') renderOnlineGame(room);
      else if (room.meta.status === 'done') renderOnlineResult(room);
    });
  }

  function renderLobby(room) {
    const players = room.players || {};
    const ids = Object.keys(players);
    const wrap = qs('#lobby-players');
    wrap.innerHTML = ids.map((id) => `
      <div class="player-chip${id === MP.playerId ? ' me' : ''}">
        ${players[id].name}${id === room.meta.hostId ? ' 👑' : ''}${id === MP.playerId ? ' (you)' : ''}
      </div>
    `).join('');

    const startBtn = qs('#online-start-btn');
    if (MP.isHost && ids.length >= 2) {
      startBtn.classList.remove('hidden');
      qs('#lobby-wait-note').textContent = 'Both players are in — start whenever ready.';
    } else if (MP.isHost) {
      startBtn.classList.add('hidden');
      qs('#lobby-wait-note').textContent = 'Share this code with a friend. Waiting for them to join…';
    } else {
      startBtn.classList.add('hidden');
      qs('#lobby-wait-note').textContent = 'Waiting for the host to start the match…';
    }
  }

  async function startMatch() {
    if (!MP.isHost) return;
    const roomSnap = await MP.db.ref(`rooms/${MP.roomCode}`).once('value');
    const room = roomSnap.val();
    const ids = Object.keys(room.players || {});
    if (ids.length < 2) return;
    const [idA, idB] = ids; // first two joiners play; extra joiners are spectators in this v1

    await MP.db.ref(`rooms/${MP.roomCode}/meta/status`).set('toss');
    await MP.db.ref(`rooms/${MP.roomCode}/toss`).set({
      playerAId: idA, playerBId: idB,
      callerId: idA, call: null, result: null, winnerId: null, choice: null,
    });
  }

  function otherIdOf(t, id) { return t.playerAId === id ? t.playerBId : t.playerAId; }

  async function callToss(call) {
    const code = MP.roomCode;
    const tossSnap = await MP.db.ref(`rooms/${code}/toss`).once('value');
    const t = tossSnap.val();
    if (!t || t.call) return; // already called
    const landsHeads = Math.random() < 0.5;
    const result = landsHeads ? 'heads' : 'tails';
    const winnerId = call === result ? t.callerId : otherIdOf(t, t.callerId);
    await MP.db.ref(`rooms/${code}/toss`).update({ call, result, winnerId });
  }

  async function chooseBatBowl(choice) {
    const code = MP.roomCode;
    const tossSnap = await MP.db.ref(`rooms/${code}/toss`).once('value');
    const t = tossSnap.val();
    if (!t || t.choice) return; // already chosen
    const battingFirstId = choice === 'bat' ? t.winnerId : otherIdOf(t, t.winnerId);
    const bowlingFirstId = otherIdOf(t, battingFirstId);
    await MP.db.ref(`rooms/${code}/toss/choice`).set(choice);
    const meta = (MP.room && MP.room.meta) || {};
    await MP.db.ref(`rooms/${code}/match`).set({
      playerAId: t.playerAId, playerBId: t.playerBId,
      battingId: battingFirstId, bowlingId: bowlingFirstId,
      overs: meta.overs || 2, wicketsLimit: meta.wickets || 2,
      inningsNum: 1, target: null,
      score: {
        [t.playerAId]: { runs: 0, wkts: 0, balls: 0 },
        [t.playerBId]: { runs: 0, wkts: 0, balls: 0 },
      },
      currentBall: {}, ballSeq: 0, lastResult: null,
    });
    await MP.db.ref(`rooms/${code}/meta/status`).set('playing');
  }

  /* ---------------- toss (real heads/tails call, synced live) ---------------- */
  function renderOnlineToss(room) {
    showScreenSafe('online-toss');
    const t = room.toss;
    if (!t) return;
    const isCaller = MP.playerId === t.callerId;
    const callRow = qs('#online-call-row');
    const batBowlRow = qs('#online-bat-bowl-row');
    const resultEl = qs('#online-toss-result');
    const subEl = qs('#online-toss-sub');

    if (!t.result) {
      resultEl.textContent = '';
      batBowlRow.classList.add('hidden');
      if (isCaller) {
        callRow.classList.remove('hidden');
        subEl.textContent = 'Call it in the air';
      } else {
        callRow.classList.add('hidden');
        subEl.textContent = `${nameOf(room, t.callerId)} is calling the toss…`;
      }
    } else {
      callRow.classList.add('hidden');
      const winnerIsMe = t.winnerId === MP.playerId;
      subEl.textContent = '';
      resultEl.textContent = `It's ${t.result.toUpperCase()}! ${winnerIsMe ? 'You' : nameOf(room, t.winnerId)} won the toss.`;
      if (!t.choice) {
        if (winnerIsMe) {
          batBowlRow.classList.remove('hidden');
        } else {
          batBowlRow.classList.add('hidden');
          subEl.textContent = `Waiting for ${nameOf(room, t.winnerId)} to choose bat or bowl…`;
        }
      } else {
        batBowlRow.classList.add('hidden');
      }
    }
  }

  /* ---------------- gameplay ---------------- */
  function opponentId(room) {
    return room.match.playerAId === MP.playerId ? room.match.playerBId : room.match.playerAId;
  }
  function nameOf(room, id) {
    return (room.players[id] && room.players[id].name) || '?';
  }
  function numberEmojiMP(n) {
    const map = ['✊', '☝️', '✌️', '🤟', '🖖', '🖐️', '👐'];
    return map[n] || '✊';
  }

  function renderOnlineGame(room) {
    showScreenSafe('online-game');
    const m = room.match;
    const oppId = opponentId(room);
    const isPlayerBatting = m.battingId === MP.playerId;
    const battingScore = m.score[m.battingId] || { runs: 0, wkts: 0, balls: 0 };
    const totalBalls = m.overs * 6;

    qs('#mp-team-a-tag').textContent = nameOf(room, oppId);
    qs('#mp-team-b-tag').textContent = MP.playerName;
    qs('#mp-team-a-role').textContent = m.battingId === oppId ? 'Batting' : 'Bowling';
    qs('#mp-team-b-role').textContent = isPlayerBatting ? 'Batting' : 'Bowling';
    qs('#mp-big-score').textContent = `${battingScore.runs}/${battingScore.wkts}`;
    const oversDone = (Math.floor(battingScore.balls / 6) + (battingScore.balls % 6) / 10).toFixed(1);
    qs('#mp-overs-line').textContent = `${oversDone} / ${m.overs}.0 ov`;
    qs('#mp-innings-banner').textContent = `Innings ${m.inningsNum} — ${isPlayerBatting ? 'You are batting now' : 'You are bowling now'}`;
    qs('#mp-hand-a-label').textContent = nameOf(room, oppId);
    qs('#mp-hand-b-label').textContent = MP.playerName;

    const targetLine = qs('#mp-target-line');
    if (m.inningsNum === 2 && m.target != null) {
      targetLine.classList.remove('hidden');
      const need = m.target - battingScore.runs;
      targetLine.textContent = need > 0 ? `Target ${m.target} — need ${need} off ${Math.max(0, totalBalls - battingScore.balls)} balls` : 'Target reached!';
    } else {
      targetLine.classList.add('hidden');
    }

    // reveal handling: only redraw the "just resolved" ball once per ballSeq
    if (m.lastResult && m.lastResult.ballSeq !== MP.lastRenderedBallSeq) {
      MP.lastRenderedBallSeq = m.lastResult.ballSeq;
      const r = m.lastResult;
      const myNum = r.picks[MP.playerId];
      const oppNum = r.picks[oppId];
      qs('#mp-hand-b').textContent = numberEmojiMP(myNum);
      qs('#mp-hand-a').textContent = numberEmojiMP(oppNum);
      qs('#mp-hand-b-number').textContent = myNum;
      qs('#mp-hand-a-number').textContent = oppNum;
      qs('#mp-commentary').textContent = r.isWicket
        ? `Both showed ${r.batterNum} — OUT!`
        : `${nameOf(room, r.battingId)} showed ${r.batterNum} → ${r.runs} run${r.runs === 1 ? '' : 's'}`;
    }

    const cb = m.currentBall || {};
    const alreadyPicked = MP.playerId in cb;
    qs('#mp-pick-prompt').textContent = alreadyPicked ? 'Waiting for opponent…' : 'Pick your number';
    qsa('#mp-ball-row .ball').forEach((b) => { b.disabled = alreadyPicked; });

    // try to resolve — safe even if both clients attempt it (transaction is atomic)
    tryResolveBall();
  }

  qsa('#mp-ball-row .ball').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!MP.roomCode) return;
      const n = parseInt(btn.dataset.n, 10);
      await MP.db.ref(`rooms/${MP.roomCode}/match/currentBall/${MP.playerId}`).set(n);
    });
  });

  function tryResolveBall() {
    const matchRef = MP.db.ref(`rooms/${MP.roomCode}/match`);
    matchRef.transaction((m) => {
      if (!m) return m;
      const cb = m.currentBall || {};
      const battingId = m.battingId, bowlingId = m.bowlingId;
      if (!(battingId in cb) || !(bowlingId in cb)) return; // abort — wait for both picks

      const batterNum = cb[battingId];
      const bowlerNum = cb[bowlingId];
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
          m.firstInningsRuns = s.runs;
          m.firstInningsWkts = s.wkts;
          m.firstBattingId = battingId;
          m.target = s.runs + 1;
          m.inningsNum = 2;
          const prevBatting = m.battingId, prevBowling = m.bowlingId;
          m.battingId = prevBowling;
          m.bowlingId = prevBatting;
        } else {
          m.matchDone = true;
        }
      }
      return m;
    }).then(() => {
      // if the match just finished, flip room status so both clients navigate to the result screen
      MP.db.ref(`rooms/${MP.roomCode}/match/matchDone`).once('value').then((snap) => {
        if (snap.val() === true) {
          MP.db.ref(`rooms/${MP.roomCode}/meta/status`).set('done').catch(() => {});
        }
      });
    }).catch((e) => console.error('resolve transaction failed', e));
  }

  function renderOnlineResult(room) {
    showScreenSafe('online-result');
    const m = room.match;
    const oppId = opponentId(room);

    if (m.quitBy) {
      const iQuit = m.quitBy === MP.playerId;
      qs('#mp-result-emoji').textContent = iQuit ? '😔' : '🏆';
      qs('#mp-result-title').textContent = iQuit ? 'You forfeited this match.' : `${nameOf(room, m.quitBy)} left — you win!`;
      qs('#mp-result-sub').textContent = '';
      if (MP.statsRecordedForCode !== MP.roomCode && typeof window.HC_recordMatchStats === 'function') {
        MP.statsRecordedForCode = MP.roomCode;
        const myScore = m.score[MP.playerId] || { runs: 0, wkts: 0, balls: 0 };
        const oppScore = m.score[oppId] || { runs: 0, wkts: 0, balls: 0 };
        window.HC_recordMatchStats('multiplayer', {
          outcome: iQuit ? 'lose' : 'win',
          runsScored: myScore.runs, ballsFaced: myScore.balls,
          wicketsTaken: oppScore.wkts, runsConceded: oppScore.runs,
        });
      }
      return;
    }

    const secondBattingId = m.battingId; // after the innings-2 swap this is who batted last
    const firstBattingId = m.firstBattingId;
    const firstRuns = m.firstInningsRuns;
    const secondScore = m.score[secondBattingId];
    const secondRuns = secondScore.runs;

    let title;
    let iWon = false;
    if (secondRuns > firstRuns) {
      const wicketsInHand = m.wicketsLimit - secondScore.wkts;
      title = `${nameOf(room, secondBattingId)} won by ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'}!`;
      iWon = secondBattingId === MP.playerId;
    } else if (secondRuns < firstRuns) {
      const margin = firstRuns - secondRuns;
      title = `${nameOf(room, firstBattingId)} won by ${margin} run${margin === 1 ? '' : 's'}!`;
      iWon = firstBattingId === MP.playerId;
    } else {
      title = "It's a tie!";
    }
    qs('#mp-result-emoji').textContent = iWon ? '🏆' : '😔';
    qs('#mp-result-title').textContent = title;
    qs('#mp-result-sub').textContent = `${nameOf(room, firstBattingId)} ${firstRuns}/${m.firstInningsWkts} — ${nameOf(room, secondBattingId)} ${secondRuns}/${secondScore.wkts}`;

    // record multiplayer stats exactly once per finished match
    if (MP.statsRecordedForCode !== MP.roomCode && typeof window.HC_recordMatchStats === 'function') {
      MP.statsRecordedForCode = MP.roomCode;
      const myScore = m.score[MP.playerId] || { runs: 0, wkts: 0, balls: 0 };
      const oppScore = m.score[oppId] || { runs: 0, wkts: 0, balls: 0 };
      const outcome = title.includes('tie') ? 'tie' : (iWon ? 'win' : 'lose');
      window.HC_recordMatchStats('multiplayer', {
        outcome,
        runsScored: myScore.runs,
        ballsFaced: myScore.balls,
        wicketsTaken: oppScore.wkts,
        runsConceded: oppScore.runs,
      });
    }
  }

  /* ---------------- misc ---------------- */
  function detachRoomListener() {
    if (MP.roomUnsub && MP.roomCode) {
      MP.db.ref(`rooms/${MP.roomCode}`).off('value', MP.roomUnsub);
    }
    MP.roomUnsub = null;
  }
  function leaveRoom() {
    detachRoomListener();
    MP.roomCode = null; MP.playerId = null; MP.isHost = false; MP.lastRenderedBallSeq = -1;
    MP.statsRecordedForCode = null; MP.room = null;
  }
  async function quitMatchForfeit() {
    if (!confirm('Quit this match? Your opponent will be shown as the winner.')) return;
    const code = MP.roomCode;
    if (code && MP.room && MP.room.match) {
      try {
        await MP.db.ref(`rooms/${code}/match/quitBy`).set(MP.playerId);
        await MP.db.ref(`rooms/${code}/meta/status`).set('done');
      } catch (e) { console.error(e); }
    }
    leaveRoom();
    showScreenSafe('home');
  }
  function copyRoomCodeMP() {
    if (!MP.roomCode) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(MP.roomCode).catch(() => {});
    }
  }
  function showScreenSafe(name) {
    // Reuses the same screen-toggling convention as script.js
    qsa('.screen').forEach((s) => s.classList.remove('active'));
    const el = document.getElementById(`screen-${name}`);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }

  /* ---------------- wire up buttons ---------------- */
  document.body.addEventListener('click', (e) => {
    const callEl = e.target.closest('[data-online-call]');
    if (callEl) { callToss(callEl.dataset.onlineCall); return; }
    const choiceEl = e.target.closest('[data-online-choice]');
    if (choiceEl) { chooseBatBowl(choiceEl.dataset.onlineChoice); return; }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'go-online-setup') { setStatusLine(''); showScreenSafe('online-setup'); }
    if (action === 'online-create') createRoom();
    if (action === 'online-join') joinRoom();
    if (action === 'online-start-match') startMatch();
    if (action === 'online-copy-code') copyRoomCodeMP();
    if (action === 'online-leave') { leaveRoom(); showScreenSafe('home'); }
    if (action === 'online-quit-match') quitMatchForfeit();
  });
})();
