# 🏏 Hand Cricket (Web) — v2

**Is update mein kya naya hai:**
- 🐛 **Bug fix (bot ka response nahi dikhta tha):** Reveal hone ke turant baad ek dusra function haathon ko wapas ✊ pe reset kar deta tha, isliye number kabhi dikhta hi nahi tha. Ab number aur seedha "Computer showed 4 → you showed 6 → SIX!" jaisi commentary line bhi dikhti hai, aur agla ball tabhi enable hota hai jab reveal poora dikh chuka ho.
- 🐛 **Overs/Wickets robustness:** Saare dropdown values (1/2/5/10/20 overs, 1/2/3/5/10 wickets) ko `node` se 5000 simulated matches me test kiya — koi crash/hang nahi mila. Extra safety ke liye ab values clamp + validate hoti hain aur toss screen par tumhari chuni hui settings ek line me confirm bhi hoti hain.
- 🧠 **Smarter AI:** Easy/Normal/Hard teeno ab thoda-thoda seekhte hain (tumhare recent + overall number-picking pattern se), Hard mode sabse zyada — same number baar-baar mat dohrao warna wo pakad legi.
- 📊 **Mode-wise Stats screen:** Easy/Normal/Hard tabs — Win-Loss-Tied, Best Score, Total Runs, Best Bowling figure, Total Wickets — sab `localStorage` me save.
- 🏆 **Tournament (8 ya 16 teams, knockout):** Quarterfinal → Semifinal → Final (8 teams) ya Round of 16 se shuru (16 teams). Room Code se create/join karo — same code = same bracket/opponents (deterministic), taaki dost ke saath bracket compare kar sako. *Note:* abhi ye local simulation hai — sirf tumhara match ball-by-ball khelte ho, baaki matches turant auto-simulate ho jaate hain. Real-time cross-device sync ke liye backend (Firebase/Supabase) chahiye hoga — wo agla step hai.
- 🔊 **Sound effects:** Click/Four/Six/Wicket/Toss/Win — sab Web Audio se generate hote hain (koi external mp3 file nahi chahiye), Settings me on/off kar sakte ho.
- ⚙️ **Settings modal:** How to Play, Terms & Conditions, aur Preferences (Sound + Dark/Light theme) — gear icon home screen aur game screen dono jagah se khulta hai.
- 🔒 **Online Multiplayer aur Squad vs Squad** abhi bhi "Coming soon" locked cards hain — click/tap disabled, hover pe not-allowed cursor.

---


Pure HTML + CSS + JS game — koi build step nahi, koi backend nahi. Sirf 3 files:

```
index.html   → structure
style.css    → poora look (night stadium theme)
script.js    → game logic (toss, batting/bowling, AI, scoring)
```

Kaise khelte hain: har ball par tum 0–6 me se ek number choose karte ho.
Agar tumhara number aur computer ka number **match** ho jaaye → batsman **out**.
Nahi to batsman ko apna chuna hua number **runs** milta hai. Yehi asli hand-cricket rule hai.

---

## 1. Local pe test karna (deploy se pehle)

Koi installation nahi chahiye — bas double-click karke `index.html` kisi bhi browser me khol do.

Agar `file://` se koi dikkat aaye (kabhi-kabhi fonts/relative paths me), to ek chhota local server chala lo:

```bash
# Python already hoga zyada tar system me
python3 -m http.server 8000
# fir browser me kholo: http://localhost:8000
```

---

## 2. GitHub par daalna

```bash
cd handcricket
git init
git add .
git commit -m "Hand Cricket web game"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

---

## 3. Deploy karna (3 free options — koi bhi ek chuno)

### Option A — GitHub Pages (sabse simple, GitHub ke andar hi)
1. Apne repo pe jao → **Settings** → left sidebar me **Pages**.
2. "Build and deployment" me **Source → Deploy from a branch** select karo.
3. Branch: `main`, folder: `/ (root)` → **Save**.
4. 1-2 minute me link mil jayega: `https://<your-username>.github.io/<repo-name>/`

> Agar `index.html` repo ke root me hai (jaisa yahan hai), to yeh sabse asaan tarika hai.

### Option B — Netlify
1. [netlify.com](https://netlify.com) pe GitHub se login karo.
2. **Add new site → Import an existing project → GitHub** → apna repo select karo.
3. Build command: **khali chhod do** (kuch nahi), Publish directory: `.` (root)
4. Deploy → turant live link mil jayega, har `git push` pe auto-redeploy bhi hoga.

### Option C — Vercel
1. [vercel.com](https://vercel.com) pe GitHub se login karo.
2. **Add New → Project** → repo import karo.
3. Framework preset: **Other** (kyunki plain HTML hai), baaki default rehne do.
4. Deploy → link mil jayega.

Teeno options free hain aur har baar jab tum `git push` karoge, site apne aap update ho jayegi (GitHub Pages me thoda auto-sync, Netlify/Vercel me full auto-deploy).

---

## 4. Aage kya badal sakte ho

- `script.js` me `sel-overs` / `sel-wickets` ke options badal ke match format change kar sakte ho.
- `style.css` ke top pe `:root { --gold, --crimson, ... }` variables se poora color theme ek jagah se badal sakte ho.
- "Online Multiplayer" aur "Squad vs Squad" cards abhi disabled hain (`menu-card--locked` class) — jab real-time backend (Firebase/Socket.io/Supabase) add karoge, tab enable kar dena.
- Stats (`played`, `won`, `best`) abhi browser ke `localStorage` me save hoti hain — matlab sirf usi device/browser pe yaad rahengi, server pe nahi. App banate waqt isko real backend se replace karna hoga.

---

## 5. "App ki tarah" banane ka future plan (jab ready ho)

Jab web version test ho jaye aur pasand aaye, in directions me le ja sakte ho:
- **PWA** bana do (manifest.json + service worker) → users "Add to Home Screen" kar sakenge, offline bhi chalega — bina app store ke.
- Ya **React Native / Flutter** me wahi game-logic (`script.js` ka JS logic) reuse karke real mobile app bana sakte ho.
- Online multiplayer ke liye Firebase Realtime Database / Supabase realtime accha fit rahega (dono free tier dete hain).

Abhi ke liye bas GitHub Pages / Netlify pe daal ke link share kar sakte ho. 🎉
