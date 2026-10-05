/* ============================================================
   AVATAR SYSTEM — customizable SVG player (cap, hairstyle, tattoo,
   jersey name) with batting/bowling poses and short, replayable
   CSS animations for six / four / out, plus a small umpire figure
   that signals every outcome. Pure inline SVG (no image files), so
   it stays crisp at any size — important if this ever gets wrapped
   into a mobile app shell.
   ============================================================ */
(function () {
  const CONFIG_KEY = 'handcricket_avatar_v1';
  const UNLOCKS_KEY = 'handcricket_avatar_unlocks_v1';

  const CATALOG = {
    caps: {
      none:    { label: 'No Cap',       cost: 0,  color: null },
      classic: { label: 'Classic Cap',  cost: 0,  color: '#c0392b' },
      bandana: { label: 'Bandana',      cost: 15, color: '#e8b94d' },
      sun:     { label: 'Sun Hat',      cost: 15, color: '#f4f1e8' },
    },
    hair: {
      short: { label: 'Short',  cost: 0,  },
      curly: { label: 'Curly',  cost: 0,  },
      long:  { label: 'Long',   cost: 10, },
      bald:  { label: 'Bald',   cost: 0,  },
    },
    tattoos: {
      none:   { label: 'No Tattoo', cost: 0,  color: null },
      star:   { label: 'Star',      cost: 20, color: '#e8b94d' },
      flame:  { label: 'Flame',     cost: 20, color: '#e6543f' },
      tribal: { label: 'Tribal',    cost: 25, color: '#2d1b5e' },
    },
  };

  const FREE_BY_DEFAULT = {
    caps: ['none', 'classic'],
    hair: ['short', 'curly', 'bald'],
    tattoos: ['none'],
  };

  function defaultConfig() {
    return { cap: 'classic', hair: 'short', tattoo: 'none', name: '' };
  }
  function loadConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? Object.assign(defaultConfig(), JSON.parse(raw)) : defaultConfig();
    } catch (e) { return defaultConfig(); }
  }
  function saveConfig(cfg) {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }
  function loadUnlocks() {
    try {
      const raw = localStorage.getItem(UNLOCKS_KEY);
      return raw ? Object.assign({ caps: [], hair: [], tattoos: [] }, JSON.parse(raw)) : { caps: [], hair: [], tattoos: [] };
    } catch (e) { return { caps: [], hair: [], tattoos: [] }; }
  }
  function saveUnlocks(u) {
    try { localStorage.setItem(UNLOCKS_KEY, JSON.stringify(u)); } catch (e) { /* ignore */ }
  }
  function isUnlocked(category, id) {
    if (FREE_BY_DEFAULT[category] && FREE_BY_DEFAULT[category].indexOf(id) !== -1) return true;
    const u = loadUnlocks();
    return (u[category] || []).indexOf(id) !== -1;
  }
  function unlockItem(category, id) {
    const item = CATALOG[category][id];
    if (!item) return false;
    if (isUnlocked(category, id)) return true;
    if (!window.HC_Coins || !window.HC_Coins.spendCoins(item.cost)) return false;
    const u = loadUnlocks();
    u[category] = u[category] || [];
    u[category].push(id);
    saveUnlocks(u);
    return true;
  }

  /* ---------------- SVG building blocks (chibi, gradient-shaded) ---------------- */
  const SKIN = '#f0bd93';
  const SKIN_SHADOW = '#d89b6c';
  const HAIR_COLOR = '#2b1d12';
  const PANTS_COLOR = '#2a3150';
  const PANTS_SHADOW = '#181e33';
  const JERSEY_TRIM = '#d93e32';
  const JERSEY_TRIM_DARK = '#a82a21';

  let uidCounter = 0;
  function uid(prefix) { return `${prefix}${uidCounter++}`; }

  function faceFeatures() {
    return `
      <circle cx="89" cy="60" r="3.6" fill="#2b1d12"/>
      <circle cx="111" cy="60" r="3.6" fill="#2b1d12"/>
      <circle cx="90.2" cy="58.4" r="1.1" fill="#fff"/>
      <circle cx="112.2" cy="58.4" r="1.1" fill="#fff"/>
      <ellipse cx="79" cy="68" rx="5.5" ry="3.6" fill="#f3a6a6" opacity="0.55"/>
      <ellipse cx="121" cy="68" rx="5.5" ry="3.6" fill="#f3a6a6" opacity="0.55"/>
      <path d="M90 72 q10 7 20 0" fill="none" stroke="#9a5a33" stroke-width="2.2" stroke-linecap="round"/>`;
  }
  function hairShape(hair) {
    if (hair === 'bald') return '';
    if (hair === 'short') return `<path d="M66 50 a34 34 0 0 1 68 0 l-5 3 a28 28 0 0 0 -58 0 z" fill="${HAIR_COLOR}"/>`;
    if (hair === 'curly') return `
      <circle cx="74" cy="38" r="9" fill="${HAIR_COLOR}"/>
      <circle cx="90" cy="29" r="10" fill="${HAIR_COLOR}"/>
      <circle cx="110" cy="29" r="10" fill="${HAIR_COLOR}"/>
      <circle cx="126" cy="38" r="9" fill="${HAIR_COLOR}"/>`;
    if (hair === 'long') return `
      <path d="M66 50 a34 34 0 0 1 68 0 z" fill="${HAIR_COLOR}"/>
      <path d="M64 52 q-8 30 3 50 l9 -3 q-7 -26 0 -47 z" fill="${HAIR_COLOR}"/>
      <path d="M136 52 q8 30 -3 50 l-9 -3 q7 -26 0 -47 z" fill="${HAIR_COLOR}"/>`;
    return '';
  }
  function capShape(cap) {
    const c = CATALOG.caps[cap];
    if (!c || cap === 'none') return '';
    if (cap === 'classic') return `
      <path d="M65 44 a35 35 0 0 1 70 0 l0 4 l-70 0 z" fill="${c.color}"/>
      <ellipse cx="112" cy="47" rx="20" ry="6" fill="${c.color}"/>
      <ellipse cx="90" cy="32" rx="14" ry="8" fill="#fff" opacity="0.18"/>`;
    if (cap === 'bandana') return `
      <path d="M65 40 a35 35 0 0 1 70 0 l-5 8 l-60 0 z" fill="${c.color}"/>
      <path d="M130 42 l13 12 l-10 3 z" fill="${c.color}"/>`;
    if (cap === 'sun') return `
      <ellipse cx="100" cy="42" rx="46" ry="10" fill="${c.color}" stroke="#cbb98f" stroke-width="2"/>
      <path d="M65 42 a34 34 0 0 1 68 0 z" fill="${c.color}"/>`;
    return '';
  }
  function tattooShape(tattoo, armX, armY) {
    const t = CATALOG.tattoos[tattoo];
    if (!t || tattoo === 'none') return '';
    if (tattoo === 'star') return `<path d="M${armX} ${armY - 6} l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5 -2.4 -4.5 2.4 .9 -5 -3.6 -3.5 5 -.7 z" fill="${t.color}"/>`;
    if (tattoo === 'flame') return `<path d="M${armX} ${armY - 8} q5 4 3 9 q-1 3 -4 3 q-4 0 -4 -4 q0 -2 2 -3 q-2 3 0 5 q1 1 2 0 q2 -2 0 -5 q2 1 1 -5 z" fill="${t.color}"/>`;
    if (tattoo === 'tribal') return `<path d="M${armX - 4} ${armY - 8} q6 2 6 8 q0 6 -6 8" fill="none" stroke="${t.color}" stroke-width="2.5" stroke-linecap="round"/>`;
    return '';
  }
  function nameText(name) {
    const safe = (name || '').toUpperCase().slice(0, 10);
    if (!safe) return '';
    return `<text x="100" y="128" font-size="12" font-weight="700" fill="${JERSEY_TRIM_DARK}" text-anchor="middle" font-family="Rajdhani, sans-serif" letter-spacing="1">${escapeXml(safe)}</text>`;
  }
  function escapeXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function sharedDefs(skinId, jerseyId, pantsId) {
    return `<defs>
      <radialGradient id="${skinId}" cx="38%" cy="32%" r="75%">
        <stop offset="0%" stop-color="${SKIN}"/><stop offset="100%" stop-color="${SKIN_SHADOW}"/>
      </radialGradient>
      <linearGradient id="${jerseyId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#e7e7ef"/>
      </linearGradient>
      <linearGradient id="${pantsId}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${PANTS_COLOR}"/><stop offset="100%" stop-color="${PANTS_SHADOW}"/>
      </linearGradient>
    </defs>`;
  }

  function buildBattingSVG(cfg) {
    const skinId = uid('skinB'), jerseyId = uid('jerB'), pantsId = uid('panB'), helmId = uid('helB'), batId = uid('batB'), ballId = uid('balB');
    return `
<svg viewBox="0 0 200 230" class="avatar-svg avatar-batting" xmlns="http://www.w3.org/2000/svg">
  ${sharedDefs(skinId, jerseyId, pantsId)}
  <radialGradient id="${helmId}" cx="35%" cy="25%" r="80%">
    <stop offset="0%" stop-color="#ef5d4f"/><stop offset="100%" stop-color="${JERSEY_TRIM_DARK}"/>
  </radialGradient>
  <linearGradient id="${batId}" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#e8b57a"/><stop offset="55%" stop-color="#d9a461"/><stop offset="100%" stop-color="#a9733a"/>
  </linearGradient>
  <ellipse cx="100" cy="220" rx="42" ry="7" fill="#000" opacity="0.18"/>
  <!-- legs + pads -->
  <rect x="72" y="150" width="24" height="46" rx="11" fill="url(#${pantsId})"/>
  <rect x="104" y="150" width="24" height="46" rx="11" fill="url(#${pantsId})"/>
  <rect x="66" y="166" width="34" height="38" rx="12" fill="#f6f2e8" stroke="${JERSEY_TRIM}" stroke-width="2.5"/>
  <rect x="100" y="166" width="34" height="38" rx="12" fill="#f6f2e8" stroke="${JERSEY_TRIM}" stroke-width="2.5"/>
  <rect x="70" y="178" width="26" height="5" rx="2.5" fill="${JERSEY_TRIM}" opacity="0.7"/>
  <rect x="104" y="178" width="26" height="5" rx="2.5" fill="${JERSEY_TRIM}" opacity="0.7"/>
  <ellipse cx="83" cy="204" rx="17" ry="8" fill="#211a14"/>
  <ellipse cx="117" cy="204" rx="17" ry="8" fill="#211a14"/>
  <!-- back (offside) arm, behind body -->
  <g class="arm-back-group" style="transform-origin:140px 114px;">
    <rect x="132" y="108" width="19" height="42" rx="9.5" fill="url(#${skinId})"/>
  </g>
  <!-- body / jersey -->
  <rect x="62" y="92" width="76" height="74" rx="28" fill="url(#${jerseyId})" stroke="#d8d8e2" stroke-width="2"/>
  <path d="M62 120 a28 28 0 0 1 28 -28 l20 0 a28 28 0 0 1 28 28 z" fill="${JERSEY_TRIM}"/>
  ${nameText(cfg.name)}
  <!-- front (leg-side) arm -->
  <g class="arm-front-group" style="transform-origin:60px 114px;">
    <rect x="50" y="108" width="19" height="40" rx="9.5" fill="url(#${skinId})"/>
    ${tattooShape(cfg.tattoo, 59, 128)}
  </g>
  <!-- head + helmet -->
  <circle cx="100" cy="58" r="35" fill="url(#${skinId})"/>
  ${faceFeatures()}
  <path d="M64 54 a36 36 0 0 1 72 0 l0 10 l-8 0 a28 28 0 0 0 -56 0 l-8 0 z" fill="url(#${helmId})"/>
  <ellipse cx="84" cy="40" rx="16" ry="9" fill="#fff" opacity="0.22"/>
  <rect x="80" y="68" width="40" height="4" rx="2" fill="#2a2a2a" opacity="0.55"/>
  <rect x="80" y="76" width="40" height="4" rx="2" fill="#2a2a2a" opacity="0.55"/>
  <rect x="80" y="84" width="40" height="4" rx="2" fill="#2a2a2a" opacity="0.4"/>
  <!-- bat + gloved hands, drawn on top so they read clearly over the body -->
  <g class="bat-group" style="transform-origin:146px 128px;">
    <rect x="140" y="112" width="12" height="24" rx="4" fill="#4a3220"/>
    <rect x="136" y="134" width="20" height="66" rx="8" fill="url(#${batId})" stroke="#8a5e2e" stroke-width="2"/>
  </g>
  <ellipse cx="144" cy="150" rx="13" ry="11" fill="#f6f2e8" stroke="${JERSEY_TRIM}" stroke-width="2"/>
  <ellipse cx="59" cy="148" rx="13" ry="11" fill="#f6f2e8" stroke="${JERSEY_TRIM}" stroke-width="2"/>
</svg>`;
  }

  function buildBowlingSVG(cfg) {
    const skinId = uid('skinW'), jerseyId = uid('jerW'), pantsId = uid('panW'), ballId = uid('balW');
    return `
<svg viewBox="0 0 200 230" class="avatar-svg avatar-bowling" xmlns="http://www.w3.org/2000/svg">
  ${sharedDefs(skinId, jerseyId, pantsId)}
  <radialGradient id="${ballId}" cx="35%" cy="30%" r="75%">
    <stop offset="0%" stop-color="#ef5d4f"/><stop offset="100%" stop-color="${JERSEY_TRIM_DARK}"/>
  </radialGradient>
  <ellipse cx="100" cy="220" rx="42" ry="7" fill="#000" opacity="0.18"/>
  <!-- legs: delivery stride -->
  <rect x="58" y="150" width="23" height="50" rx="10" fill="url(#${pantsId})" transform="rotate(-12 69 150)"/>
  <rect x="112" y="150" width="23" height="50" rx="10" fill="url(#${pantsId})" transform="rotate(16 123 150)"/>
  <ellipse cx="62" cy="202" rx="16" ry="8" fill="#211a14"/>
  <ellipse cx="134" cy="204" rx="16" ry="8" fill="#211a14"/>
  <!-- body / jersey -->
  <rect x="62" y="92" width="76" height="74" rx="28" fill="url(#${jerseyId})" stroke="#d8d8e2" stroke-width="2"/>
  <path d="M62 120 a28 28 0 0 1 28 -28 l20 0 a28 28 0 0 1 28 28 z" fill="${JERSEY_TRIM}"/>
  ${nameText(cfg.name)}
  <!-- head -->
  <circle cx="100" cy="58" r="35" fill="url(#${skinId})"/>
  ${faceFeatures()}
  ${hairShape(cfg.hair)}
  ${capShape(cfg.cap)}
  <!-- both arms drawn on top so they read clearly over the body -->
  <g class="arm-balance-group" style="transform-origin:66px 114px;">
    <rect x="56" y="108" width="19" height="40" rx="9.5" fill="url(#${skinId})" transform="rotate(-28 66 114)"/>
    <g transform="rotate(-28 66 114)">${tattooShape(cfg.tattoo, 65, 130)}</g>
  </g>
  <g class="arm-bowl-group" style="transform-origin:134px 114px;">
    <rect x="126" y="44" width="19" height="46" rx="9.5" fill="url(#${skinId})" transform="rotate(8 135 114)"/>
    <circle class="ball-group" cx="137" cy="38" r="11" fill="url(#${ballId})"/>
    <path class="ball-group" d="M129 33 q8 5 0 10" fill="none" stroke="#f4d9d9" stroke-width="1.6"/>
  </g>
</svg>`;
  }

  function buildUmpireSVG() {
    const skinId = uid('skinU'), shirtId = uid('shiU');
    return `
<svg viewBox="0 0 130 190" class="umpire-svg" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="${skinId}" cx="38%" cy="32%" r="75%">
      <stop offset="0%" stop-color="${SKIN}"/><stop offset="100%" stop-color="${SKIN_SHADOW}"/>
    </radialGradient>
    <linearGradient id="${shirtId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#dfe3ea"/>
    </linearGradient>
  </defs>
  <ellipse cx="65" cy="182" rx="28" ry="6" fill="#000" opacity="0.15"/>
  <rect x="46" y="118" width="15" height="54" rx="7" fill="#15161c"/>
  <rect x="69" y="118" width="15" height="54" rx="7" fill="#15161c"/>
  <ellipse cx="53" cy="174" rx="12" ry="6" fill="#0a0a0a"/>
  <ellipse cx="76" cy="174" rx="12" ry="6" fill="#0a0a0a"/>
  <rect x="38" y="68" width="54" height="58" rx="20" fill="url(#${shirtId})" stroke="#c7cbd4" stroke-width="2"/>
  <g class="ump-arm-left" style="transform-origin:44px 80px;">
    <rect x="30" y="76" width="15" height="38" rx="7.5" fill="url(#${shirtId})" stroke="#c7cbd4" stroke-width="1.5"/>
  </g>
  <g class="ump-arm-right" style="transform-origin:86px 80px;">
    <rect x="86" y="76" width="15" height="38" rx="7.5" fill="url(#${shirtId})" stroke="#c7cbd4" stroke-width="1.5"/>
    <circle class="ump-finger" cx="93" cy="72" r="4" fill="url(#${skinId})" opacity="0"/>
  </g>
  <circle cx="65" cy="50" r="24" fill="url(#${skinId})"/>
  <circle cx="57" cy="52" r="2.6" fill="#2b1d12"/>
  <circle cx="73" cy="52" r="2.6" fill="#2b1d12"/>
  <path d="M57 60 q8 5 16 0" fill="none" stroke="#9a5a33" stroke-width="1.8" stroke-linecap="round"/>
  <ellipse cx="65" cy="30" rx="30" ry="9" fill="#f6f2e8" stroke="#cbb98f" stroke-width="1.5"/>
  <path d="M42 24 a18 18 0 0 1 36 0 z" fill="#f4f1e8"/>
</svg>`;
  }

  /* ---------------- render + animate API ---------------- */
  function renderInto(containerEl, pose, cfgOverride) {
    const cfg = cfgOverride || loadConfig();
    containerEl.innerHTML = pose === 'batting' ? buildBattingSVG(cfg) : buildBowlingSVG(cfg);
  }
  function renderUmpireInto(containerEl) {
    containerEl.innerHTML = buildUmpireSVG();
  }
  function fireOnce(el, className, duration) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth; // restart animation reliably
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), duration);
  }
  function playBatSwing(containerEl, big) {
    if (!containerEl) return;
    const batGroup = containerEl.querySelector('.bat-group');
    fireOnce(batGroup, big ? 'swing-six' : 'swing-four', 600);
    if (big) fireOnce(containerEl, 'avatar-hop', 600);
  }
  function playBowlRelease(containerEl) {
    if (!containerEl) return;
    const armGroup = containerEl.querySelector('.arm-bowl-group');
    fireOnce(armGroup, 'bowl-release', 550);
  }
  function playBowlerCheer(containerEl) {
    if (!containerEl) return;
    fireOnce(containerEl.querySelector('.arm-bowl-group'), 'cheer-arm', 900);
    fireOnce(containerEl.querySelector('.arm-balance-group'), 'cheer-arm', 900);
    fireOnce(containerEl, 'avatar-hop', 900);
  }
  function playUmpireSignal(umpireEl, type) {
    if (!umpireEl) return;
    const left = umpireEl.querySelector('.ump-arm-left');
    const right = umpireEl.querySelector('.ump-arm-right');
    const finger = umpireEl.querySelector('.ump-finger');
    if (type === 'six') {
      fireOnce(left, 'ump-up', 1400);
      fireOnce(right, 'ump-up', 1400);
    } else if (type === 'four') {
      fireOnce(right, 'ump-wave', 1400);
    } else if (type === 'out') {
      fireOnce(right, 'ump-up', 1400);
      if (finger) { finger.style.opacity = '1'; setTimeout(() => { finger.style.opacity = '0'; }, 1400); }
    }
  }

  window.HC_Avatar = {
    CATALOG, FREE_BY_DEFAULT,
    loadConfig, saveConfig, loadUnlocks, saveUnlocks, isUnlocked, unlockItem,
    renderInto, renderUmpireInto,
    playBatSwing, playBowlRelease, playBowlerCheer, playUmpireSignal,
  };
})();
