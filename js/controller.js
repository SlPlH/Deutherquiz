/**
 * controller.js — Client Node Logic
 * Phone interface, connects to Master via PeerJS
 */

class ControllerApp {
  constructor() {
    this.playerId = 'player-' + Math.random().toString(36).substr(2, 9);
    this.hostId = new URLSearchParams(window.location.search).get('host');
    this.sessionRef = null;
    this.playerRef = null;
    this.hostId = new URLSearchParams(window.location.search).get('host');

    this.playerInfo = {
      name: '',
      color: ''
    };

    this.questionDuration = 0;
    this.timerInterval = null;
    this.currentNumVal = '';

    // DOM
    this.els = {
      screens: {
        connecting: document.getElementById('ctrl-connecting'),
        join: document.getElementById('ctrl-join'),
        waiting: document.getElementById('ctrl-waiting'),
        question: document.getElementById('ctrl-question'),
        feedback: document.getElementById('ctrl-feedback'),
        gameover: document.getElementById('ctrl-gameover')
      },

      // Join
      inputName: document.getElementById('input-name'),
      colorPicker: document.getElementById('color-picker'),
      btnJoin: document.getElementById('btn-join'),

      // Question
      regionName: document.getElementById('ctrl-region-name'),
      timerBar: document.getElementById('ctrl-timer-bar'),
      qText: document.getElementById('ctrl-q-text'),
      mcContainer: document.getElementById('ctrl-mc-container'),
      numContainer: document.getElementById('ctrl-num-container'),
      numDisplay: document.getElementById('num-display'),
      btnNumDel: document.getElementById('btn-num-del'),
      btnNumSubmit: document.getElementById('btn-num-submit'),
      timeUpMsg: document.getElementById('ctrl-time-up-msg'),
      mcBtns: document.querySelectorAll('.mc-btn'),
      numKeys: document.querySelectorAll('.num-key[data-val]'),

      // Feedback
      fbIcon: document.getElementById('fb-icon'),
      fbTitle: document.getElementById('fb-title'),
      fbSubtitle: document.getElementById('fb-subtitle'),
      fbScore: document.getElementById('fb-score'),
      fbCorrectAns: document.getElementById('fb-correct-ans'),

      // Gameover
      goRank: document.getElementById('gameover-rank'),
      goScore: document.getElementById('gameover-score')
    };

    // Color Palette
    this.colors = [
      '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
      '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
      '#84cc16', '#6366f1', '#d946ef', '#0ea5e9', '#10b981'
    ];

    this.init();
  }

  init() {
    this.renderColors();
    this.bindEvents();

    if (!this.hostId) {
      this.showScreen('join');
      this.showToast('Keine Host-ID gefunden. Bitte scanne den QR-Code erneut.', 'error');
      return;
    }

    this.setupFirebase();
  }

  renderColors() {
    this.els.colorPicker.innerHTML = '';
    this.colors.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'color-swatch';
      btn.style.background = c;
      if (i === 0) {
        btn.classList.add('selected');
        this.playerInfo.color = c;
      }
      btn.onclick = () => {
        document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.playerInfo.color = c;
      };
      this.els.colorPicker.appendChild(btn);
    });
  }

  async setupFirebase() {
    try {
      await auth.signInAnonymously();
      
      this.sessionRef = db.ref('sessions/' + this.hostId);
      this.playerRef = this.sessionRef.child('players/' + this.playerId);

      // Verify session exists
      const snap = await this.sessionRef.child('state').once('value');
      if (!snap.exists()) {
        throw new Error('Host nicht gefunden.');
      }

      this.showScreen('join');

      // Listen for game state changes
      this.sessionRef.child('state').on('value', s => {
        const state = s.val();

        if (state === null) {
          // Host closed the session, disconnect to free up concurrent connections
          this.showScreen('connecting');
          this.els.screens.connecting.innerHTML = '<h2>Spiel beendet</h2><p>Host hat die Sitzung geschlossen.</p>';
          if (this.playerRef) {
            this.playerRef.child('online').onDisconnect().cancel();
          }
          firebase.database().goOffline();
          return;
        }

        if (state === 'lobby' || state === 'waiting' || state === 'lobby_wait') {
          if (this.playerInfo.name) {
            document.getElementById('waiting-name').textContent = this.playerInfo.name;
            document.getElementById('waiting-avatar').textContent = this.playerInfo.name.charAt(0).toUpperCase();
            document.getElementById('waiting-avatar').style.background = this.playerInfo.color;
            this.showScreen('waiting');
          }
        }
      });

      // Listen for new questions
      this.sessionRef.child('questionData').on('value', s => {
        const qData = s.val();
        if (qData) {
          this.prepareQuestion(qData, "Alle"); // region label is legacy
        }
      });

      // Listen for personal feedback
      this.playerRef.child('feedback').on('value', s => {
        const fb = s.val();
        if (fb) {
          this.showFeedback(fb);
        }
      });

      // Listen for game over stats
      this.playerRef.child('gameover').on('value', s => {
        const go = s.val();
        if (go) {
          this.els.goRank.textContent = `Dein Rang: #${go.rank}`;
          this.els.goScore.textContent = `${go.score} Pkt`;
          this.showScreen('gameover');
        }
      });

    } catch (e) {
      this.showToast(e.message, 'error');
      this.showScreen('connecting');
      this.els.screens.connecting.innerHTML = '<h2>Fehler beim Verbinden</h2><p>Bitte QR-Code neu scannen.</p>';
    }
  }

  bindEvents() {
    this.els.btnJoin.addEventListener('click', () => {
      const name = this.els.inputName.value.trim();
      if (!name) {
        this.showToast('Bitte Namen eingeben', 'error');
        return;
      }
      this.playerInfo.name = name;

      this.els.btnJoin.disabled = true;
      this.els.btnJoin.textContent = 'Verbunden!';

      // Join game in Firebase
      this.playerRef.set({
        name: this.playerInfo.name,
        color: this.playerInfo.color,
        online: true
      });

      this.playerRef.child('online').onDisconnect().set(false);
    });

    // Multiple Choice
    this.els.mcBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        this.submitAnswer(btn.dataset.index);
        this.els.mcBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.disableInputs();
      });
    });

    // Numeric Keypad
    this.els.numKeys.forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.currentNumVal.length < 10) {
          // Prevent double dots
          if (btn.dataset.val === '.' && this.currentNumVal.includes('.')) return;
          this.currentNumVal += btn.dataset.val;
          this.updateNumDisplay();
        }
      });
    });

    this.els.btnNumDel.addEventListener('click', () => {
      this.currentNumVal = this.currentNumVal.slice(0, -1);
      this.updateNumDisplay();
    });

    this.els.btnNumSubmit.addEventListener('click', () => {
      if (!this.currentNumVal) return;
      this.submitAnswer(this.currentNumVal);
      this.disableInputs();
    });
  }

  prepareQuestion(q, region) {
    this.els.regionName.textContent = region;
    this.els.qText.textContent = q.text;
    this.els.timeUpMsg.style.display = 'none';

    if (q.type === 'multiple_choice') {
      this.els.mcContainer.style.display = 'grid';
      this.els.numContainer.style.display = 'none';

      this.els.mcBtns.forEach((btn, idx) => {
        btn.querySelector('.mc-text').textContent = q.options[idx];
        btn.disabled = false;
        btn.classList.remove('selected', 'correct', 'wrong');
      });
    } else {
      this.els.mcContainer.style.display = 'none';
      this.els.numContainer.style.display = 'flex';

      this.currentNumVal = '';
      this.updateNumDisplay();

      // Update unit display placeholder if provided
      if (q.unit) {
        this.els.numDisplay.setAttribute('data-placeholder', `... ${q.unit}`);
      } else {
        this.els.numDisplay.removeAttribute('data-placeholder');
      }
      this.els.btnNumSubmit.disabled = true;
    }

    this.startTimer(q.duration);
    this.showScreen('question');
  }

  updateNumDisplay() {
    this.els.numDisplay.textContent = this.currentNumVal;
    if (this.currentNumVal) {
      this.els.numDisplay.classList.add('has-value');
      this.els.btnNumSubmit.disabled = false;
    } else {
      this.els.numDisplay.classList.remove('has-value');
      this.els.btnNumSubmit.disabled = true;
    }
  }

  submitAnswer(val) {
    if (!this.playerRef) return;
    this.playerRef.child('answer').set({
      value: val,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  disableInputs() {
    this.els.mcBtns.forEach(b => b.disabled = true);
    this.els.btnNumSubmit.disabled = true;
    this.els.timeUpMsg.style.display = 'block';
  }

  startTimer(durationSec) {
    clearInterval(this.timerInterval);
    this.els.timerBar.style.width = '100%';
    this.els.timerBar.classList.remove('warning');

    // Force reflow
    void this.els.timerBar.offsetWidth;

    this.els.timerBar.style.transition = `width ${durationSec}s linear`;
    this.els.timerBar.style.width = '0%';

    const start = Date.now();
    this.timerInterval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = durationSec - elapsed;

      if (remaining <= 5) {
        this.els.timerBar.classList.add('warning');
      }

      if (remaining <= 0) {
        clearInterval(this.timerInterval);
        this.disableInputs();
      }
    }, 500);
  }

  showFeedback(res) {
    this.els.fbTitle.className = 'feedback-title ' + res.type;
    this.els.fbScore.style.display = 'inline-block';
    this.els.fbScore.textContent = '+' + res.scoreGained + ' Pkt';

    const expCount = res.expansionGained || 0;
    const expText = expCount > 0
      ? ` (+${expCount} Gebiet${expCount > 1 ? 'e' : ''})`
      : '';

    if (res.type === 'won') {
      this.els.fbIcon.textContent = '⚡';
      this.els.fbTitle.textContent = 'Schnellste Antwort!';
      this.els.fbSubtitle.textContent = `Du warst am schnellsten und gewinnst ${expCount} Gebiet${expCount !== 1 ? 'e' : ''}!`;
    } else if (res.type === 'close') {
      this.els.fbIcon.textContent = '✅';
      this.els.fbTitle.textContent = 'Richtig!';
      const winnerMsg = res.winnerName ? `${res.winnerName} war schneller.` : 'Jemand war schneller.';
      this.els.fbSubtitle.textContent = winnerMsg + (expCount > 0 ? ` Du gewinnst ${expCount} Gebiet${expCount !== 1 ? 'e' : ''}.` : '');
    } else if (res.type === 'eliminated') {
      this.els.fbIcon.textContent = '💀';
      this.els.fbTitle.textContent = 'Eliminiert!';
      this.els.fbSubtitle.textContent = 'Du hast alle Gebiete verloren.';
      this.els.fbScore.style.display = 'none';
    } else {
      this.els.fbIcon.textContent = '❌';
      this.els.fbTitle.textContent = 'Falsch!';
      this.els.fbSubtitle.textContent = 'Das war leider nicht richtig.';
      this.els.fbScore.style.display = 'none';
    }

    this.els.fbCorrectAns.style.display = 'block';
    this.els.fbCorrectAns.textContent = 'Richtige Antwort: ' + res.correctAnswer;

    this.showScreen('feedback');
  }

  showScreen(screenId) {
    Object.values(this.els.screens).forEach(s => {
      s.classList.remove('visible');
      s.classList.add('hidden');
    });
    this.els.screens[screenId].classList.remove('hidden');
    this.els.screens[screenId].classList.add('visible');
  }

  showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.ctrlApp = new ControllerApp();
});
