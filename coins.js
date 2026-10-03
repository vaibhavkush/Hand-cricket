/* ============================================================
   COINS — a simple "soft currency" progression layer.

   ⚠️ IMPORTANT: this balance lives in localStorage only, same as
   stats. Anyone can open DevTools and edit it. This is fine for a
   for-fun unlock/wager system between friends, but it is NOT
   cheat-proof and must NOT be treated as real money or connected
   to real payments without a proper secure backend (e.g. Firebase
   Cloud Functions that verify match results server-side before
   crediting coins). See README for more on this.
   ============================================================ */
(function () {
  const COINS_KEY = 'handcricket_coins_v1';
  const LAST_BONUS_KEY = 'handcricket_last_bonus_date';
  const START_BALANCE = 30;
  const DAILY_BONUS = 10;

  function getBalance() {
    try {
      const raw = localStorage.getItem(COINS_KEY);
      if (raw === null) { setBalance(START_BALANCE); return START_BALANCE; }
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : START_BALANCE;
    } catch (e) { return START_BALANCE; }
  }
  function setBalance(n) {
    const clamped = Math.max(0, Math.round(n));
    try { localStorage.setItem(COINS_KEY, String(clamped)); } catch (e) { /* ignore */ }
    if (typeof window.HC_onCoinsChanged === 'function') window.HC_onCoinsChanged(clamped);
    return clamped;
  }
  function addCoins(n) { return setBalance(getBalance() + n); }
  function spendCoins(n) {
    const bal = getBalance();
    if (bal < n) return false;
    setBalance(bal - n);
    return true;
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  // Stand-in for a real "sign-in bonus" until the cross-device login system
  // exists — grants once per calendar day, per device.
  function claimDailyBonusIfDue() {
    let last = null;
    try { last = localStorage.getItem(LAST_BONUS_KEY); } catch (e) { /* ignore */ }
    const today = todayStr();
    if (last === today) return 0;
    try { localStorage.setItem(LAST_BONUS_KEY, today); } catch (e) { /* ignore */ }
    addCoins(DAILY_BONUS);
    return DAILY_BONUS;
  }

  window.HC_Coins = { getBalance, setBalance, addCoins, spendCoins, claimDailyBonusIfDue, DAILY_BONUS, START_BALANCE };
})();
