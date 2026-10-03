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

  /* ---------------- SVG building blocks ---------------- */
  const SKIN = '#e8b589';
  const HAIR_COLOR = '#2b1d12';
  const PANTS_COLOR = '#22304f';
  const JERSEY_TRIM = '#c0392b';

  function hairShape(hair) {
    if (hair === 'bald') return '';
    if (hair === 'short') return `<path d="M76 34 a24 24 0 0 1 48 0 l-4 2 a20 20 0 0 0 -40 0 z" fill="${HAIR_COLOR}"/>`;
    if (hair === 'curly') return `
      <circle cx="80" cy="28" r="7" fill="${HAIR_COLOR}"/>
      <circle cx="92" cy="22" r="8" fill="${HAIR_COLOR}"/>
      <circle cx="107" cy="22" r="8" fill="${HAIR_COLOR}"/>
      <circle cx="120" cy="28" r="7" fill="${HAIR_COLOR}"/>`;
    if (hair === 'long') return `
      <path d="M76 34 a24 24 0 0 1 48 0 z" fill="${HAIR_COLOR}"/>
      <path d="M74 36 q-6 24 2 40 l8 -2 q-6 -20 0 -38 z" fill="${HAIR_COLOR}"/>
      <path d="M126 36 q6 24 -2 40 l-8 -2 q6 -20 0 -38 z" fill="${HAIR_COLOR}"/>`;
    return '';
  }
  function capShape(cap) {
    const c = CATALOG.caps[cap];
    if (!c || cap === 'none') return '';
    if (cap === 'classic') return `
      <path d="M74 36 a26 26 0 0 1 52 0 l0 4 l-52 0 z" fill="${c.color}"/>
      <ellipse cx="112" cy="40" rx="16" ry="5" fill="${c.color}"/>`;
    if (cap === 'bandana') return `
      <path d="M74 32 a26 26 0 0 1 52 0 l-4 8 l-44 0 z" fill="${c.color}"/>
      <path d="M122 34 l10 10 l-8 2 z" fill="${c.color}"/>`;
    if (cap === 'sun') return `
      <ellipse cx="100" cy="34" rx="34" ry="8" fill="${c.color}" stroke="#cbb98f" stroke-width="2"/>
      <path d="M76 34 a24 24 0 0 1 48 0 z" fill="${c.color}"/>`;
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
    return `<text x="100" y="98" font-size="11" font-weight="700" fill="${JERSEY_TRIM}" text-anchor="middle" font-family="Rajdhani, sans-serif" letter-spacing="1">${escapeXml(safe)}</text>`;
  }
  function escapeXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildBattingSVG(cfg) {
    const head = cfg.hair === 'bald' && cfg.cap === 'none' ? '' : '';
    return `
<svg viewBox="0 0 200 260" class="avatar-svg avatar-batting" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="246" rx="36" ry="6" fill="#000" opacity="0.18"/>
  <!-- legs + pads -->
  <rect x="76" y="150" width="20" height="54" rx="8" fill="${PANTS_COLOR}"/>
  <rect x="104" y="150" width="20" height="54" rx="8" fill="${PANTS_COLOR}"/>
  <rect x="72" y="176" width="28" height="30" rx="6" fill="#f4f1e8" stroke="${JERSEY_TRIM}" stroke-width="2"/>
  <rect x="100" y="176" width="28" height="30" rx="6" fill="#f4f1e8" stroke="${JERSEY_TRIM}" stroke-width="2"/>
  <ellipse cx="86" cy="208" rx="14" ry="7" fill="#1a1a1a"/>
  <ellipse cx="114" cy="208" rx="14" ry="7" fill="#1a1a1a"/>
  <!-- back (offside) arm, behind body -->
  <g class="arm-back-group" style="transform-origin:128px 76px;">
    <rect x="122" y="74" width="16" height="42" rx="8" fill="${SKIN}"/>
    <ellipse cx="130" cy="118" rx="9" ry="8" fill="${JERSEY_TRIM}"/>
  </g>
  <!-- bat -->
  <g class="bat-group" style="transform-origin:122px 112px;">
    <rect x="117" y="108" width="10" height="20" rx="3" fill="#4a3220"/>
    <rect x="113" y="124" width="18" height="58" rx="7" fill="#d9a461" stroke="#a9733a" stroke-width="2"/>
  </g>
  <!-- body / jersey -->
  <rect x="70" y="64" width="60" height="78" rx="18" fill="#ffffff" stroke="#ddd" stroke-width="2"/>
  <rect x="70" y="64" width="60" height="16" rx="10" fill="${JERSEY_TRIM}"/>
  ${nameText(cfg.name)}
  ${tattooShape(cfg.tattoo, 134, 100)}
  <!-- front (leg-side) arm -->
  <g class="arm-front-group" style="transform-origin:78px 76px;">
    <rect x="66" y="74" width="16" height="40" rx="8" fill="${SKIN}"/>
    <ellipse cx="72" cy="116" rx="9" ry="8" fill="${JERSEY_TRIM}"/>
  </g>
  <!-- head + helmet -->
  <circle cx="100" cy="46" r="24" fill="${SKIN}"/>
  <path d="M74 44 a26 26 0 0 1 52 0 l0 6 l-6 0 a20 20 0 0 0 -40 0 l-6 0 z" fill="${JERSEY_TRIM}"/>
  <rect x="88" y="54" width="24" height="3" fill="#2a2a2a" opacity="0.5"/>
  <rect x="88" y="60" width="24" height="3" fill="#2a2a2a" opacity="0.5"/>
</svg>`;
  }

  function buildBowlingSVG(cfg) {
    return `
<svg viewBox="0 0 200 260" class="avatar-svg avatar-bowling" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="246" rx="36" ry="6" fill="#000" opacity="0.18"/>
  <!-- legs: delivery stride -->
  <rect x="62" y="150" width="20" height="56" rx="8" fill="${PANTS_COLOR}" transform="rotate(-10 72 150)"/>
  <rect x="108" y="150" width="20" height="56" rx="8" fill="${PANTS_COLOR}" transform="rotate(14 118 150)"/>
  <ellipse cx="66" cy="206" rx="13" ry="7" fill="#1a1a1a"/>
  <ellipse cx="128" cy="208" rx="13" ry="7" fill="#1a1a1a"/>
  <!-- non-bowling arm, forward for balance -->
  <g class="arm-balance-group" style="transform-origin:76px 76px;">
    <rect x="68" y="72" width="16" height="38" rx="8" fill="${SKIN}" transform="rotate(-25 76 76)"/>
  </g>
  <!-- body / jersey -->
  <rect x="70" y="64" width="60" height="78" rx="18" fill="#ffffff" stroke="#ddd" stroke-width="2"/>
  <rect x="70" y="64" width="60" height="16" rx="10" fill="${JERSEY_TRIM}"/>
  ${nameText(cfg.name)}
  ${tattooShape(cfg.tattoo, 134, 100)}
  <!-- bowling arm + ball, raised back -->
  <g class="arm-bowl-group" style="transform-origin:124px 76px;">
    <rect x="118" y="40" width="16" height="42" rx="8" fill="${SKIN}" transform="rotate(10 126 76)"/>
    <circle class="ball-group" cx="128" cy="36" r="9" fill="#c0392b"/>
    <path class="ball-group" d="M122 32 q6 4 0 8" fill="none" stroke="#f4d9d9" stroke-width="1.4"/>
  </g>
  <!-- head -->
  <circle cx="100" cy="46" r="24" fill="${SKIN}"/>
  ${hairShape(cfg.hair)}
  ${capShape(cfg.cap)}
</svg>`;
  }

  function buildUmpireSVG() {
    return `
<svg viewBox="0 0 120 170" class="umpire-svg" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="60" cy="160" rx="24" ry="5" fill="#000" opacity="0.15"/>
  <rect x="44" y="92" width="14" height="50" rx="6" fill="#1c2238"/>
  <rect x="62" y="92" width="14" height="50" rx="6" fill="#1c2238"/>
  <rect x="38" y="52" width="44" height="46" rx="14" fill="#2a3150" stroke="#10131f" stroke-width="2"/>
  <g class="ump-arm-left" style="transform-origin:42px 60px;">
    <rect x="30" y="58" width="12" height="32" rx="6" fill="#2a3150"/>
  </g>
  <g class="ump-arm-right" style="transform-origin:78px 60px;">
    <rect x="78" y="58" width="12" height="32" rx="6" fill="#2a3150"/>
    <circle class="ump-finger" cx="84" cy="56" r="3" fill="${SKIN}" opacity="0"/>
  </g>
  <circle cx="60" cy="36" r="18" fill="${SKIN}"/>
  <ellipse cx="60" cy="24" rx="22" ry="7" fill="#f4f1e8" stroke="#cbb98f" stroke-width="1.5"/>
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
