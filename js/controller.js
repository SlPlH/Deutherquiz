/**
 * controller.js — Client Node Logic
 * Phone interface, connects to Master via PeerJS
 */

class ControllerApp {
  constructor() {
    this.peer = null;
    this.conn = null;
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
      '#ef4444','#f97316','#eab308','#22c55e','#06b6d4',
      '#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f59e0b',
      '#84cc16','#6366f1','#d946ef','#0ea5e9','#10b981'
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
    
    // Auto-connect to peer server
    this.peer = new Peer({ debug: 2 });
    
    this.peer.on('open', () => {
      this.connectToHost();
    });
    
    this.peer.on('error', (err) => {
      this.showToast('Fehler: ' + err.type, 'error');
      this.showScreen('join');
    });
  }

  renderColors() {
    this.els.colorPicker.innerHTML = '';
    this.colors.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'color-swatch';
      btn.style.background = c;
      if(i === 0) {
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

  connectToHost() {
    this.conn = this.peer.connect(this.hostId, { reliable: true });
    
    this.conn.on('open', () => {
      this.showScreen('join');
    });
    
    this.conn.on('data', (data) => {
      this.handleMessage(data);
    });
    
    this.conn.on('close', () => {
      this.showToast('Verbindung zum Host verloren!', 'error');
      this.showScreen('connecting');
    });
  }

  handleMessage(msg) {
    switch(msg.type) {
      case 'state':
        if(msg.state === 'lobby_wait' || msg.state === 'waiting') {
          document.getElementById('waiting-name').textContent = this.playerInfo.name;
          document.getElementById('waiting-avatar').textContent = this.playerInfo.name.charAt(0).toUpperCase();
          document.getElementById('waiting-avatar').style.background = this.playerInfo.color;
          this.showScreen('waiting');
        }
        break;
        
      case 'question':
        this.prepareQuestion(msg.question, msg.region);
        break;
        
      case 'round_result':
        this.showFeedback(msg.result);
        break;
        
      case 'game_over':
        this.els.goRank.textContent = `Dein Rang: #${msg.rank}`;
        this.els.goScore.textContent = `${msg.score} Pkt`;
        this.showScreen('gameover');
        break;
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
      this.els.btnJoin.textContent = 'Verbinde...';
      
      this.conn.send({
        type: 'join',
        name: this.playerInfo.name,
        color: this.playerInfo.color
      });
    });

    // Multiple Choice
    this.els.mcBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.disabled) return;
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
      if(!this.currentNumVal) return;
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
    if(this.currentNumVal) {
      this.els.numDisplay.classList.add('has-value');
      this.els.btnNumSubmit.disabled = false;
    } else {
      this.els.numDisplay.classList.remove('has-value');
      this.els.btnNumSubmit.disabled = true;
    }
  }

  submitAnswer(val) {
    this.conn.send({
      type: 'answer',
      value: val,
      timestamp: Date.now()
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
    
    if (res.type === 'won') {
      this.els.fbIcon.textContent = '🏆';
      this.els.fbTitle.textContent = 'Gewonnen!';
      this.els.fbSubtitle.textContent = 'Du warst am schnellsten und hast die Region erobert.';
    } else if (res.type === 'close') {
      this.els.fbIcon.textContent = '⚡';
      this.els.fbTitle.textContent = 'Richtig!';
      this.els.fbSubtitle.textContent = res.winnerName ? `${res.winnerName} war leider schneller.` : 'Leider war jemand anderes schneller.';
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

  showToast(msg, type='info') {
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
