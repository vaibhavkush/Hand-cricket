/* ============================================================
   FIREBASE CONFIG — REPLACE THESE WITH YOUR OWN PROJECT'S KEYS
   ============================================================
   Where to get them:
   1. Go to https://console.firebase.google.com and create a free project.
   2. In the project, go to Build -> Realtime Database -> Create Database
      -> pick any region -> START IN TEST MODE (we'll tighten rules below).
   3. Go to Project settings (gear icon) -> General -> "Your apps" ->
      click the "</>" (web) icon -> register an app (any nickname) ->
      it will show you a firebaseConfig object exactly like below.
      Copy those real values in place of the placeholders here.
   4. In Realtime Database -> Rules tab, paste this to start
      (works, but is intentionally open — see the note under it):

      {
        "rules": {
          "rooms": {
            "$code": {
              ".read": true,
              ".write": true
            }
          }
        }
      }

      NOTE: this lets anyone who has (or guesses) a room code read/write
      that room — fine for a casual game among friends, but before a
      public launch you should tighten this (e.g. require Firebase
      Anonymous Auth and check request.auth != null).
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAJTkOZYO5ksCrYNHy1S0lwddmqjjS2I-w",
  authDomain: "hand-cricket-6dab3.firebaseapp.com",
  databaseURL: "https://hand-cricket-6dab3-default-rtdb.firebaseio.com",
  projectId: "hand-cricket-6dab3",
  storageBucket: "hand-cricket-6dab3.firebasestorage.app",
  messagingSenderId: "567264682199",
  appId: "1:567264682199:web:692888c72854c9424b1092",
};
