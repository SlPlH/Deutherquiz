/**
 * board.js — Master Node Logic
 * Handles PeerJS connections, UI state, and game loop
 */

class BoardApp {
  constructor() {
    this.hostId = Math.random().toString(36).substr(2, 4).toUpperCase();
    this.sessionRef = null;
    this.playersRef = null;
    this.players = {};     // id -> { name, color, score, online, eliminated }
    
    this.mapRenderer = null;
    this.questionPool = [];
    this.currentQuestion = null;
    this.roundNumber = 0;
    this.roundTimer = null;
    this.roundAnswers = [];
    this.state = 'lobby'; 

    // DOM Elements
    this.els = {
      screens: {
        lobby: document.getElementById('screen-lobby'),
        game: document.getElementById('screen-game'),
        gameover: document.getElementById('screen-gameover')
      },
      playerList: document.getElementById('player-list'),
      playerCount: document.getElementById('player-count'),
      btnStart: document.getElementById('btn-start-game'),
      hostId: document.getElementById('host-id-display'),
      qrCanvas: document.getElementById('qr-canvas'),
      settingDuration: document.getElementById('setting-duration'),
      
      // Game UI
      roundCurrent: document.getElementById('round-current'),
      regionBadge: document.getElementById('active-region-badge'), // Hide this
      qCategoryIcon: document.getElementById('q-category-icon'),
      qCategoryName: document.getElementById('q-category-name'),
      qCategoryDescription: document.getElementById('q-category-description'),
      qTypeBadge: document.getElementById('q-type-badge'),
      qText: document.getElementById('q-text'),
      qOptions: document.getElementById('q-options'),
      countdownContainer: document.getElementById('countdown-container'),
      timerCircle: document.getElementById('timer-circle'),
      timerText: document.getElementById('timer-text'),
      scoreboard: document.getElementById('scoreboard-list'),
      
      // Result overlay
      resultOverlay: document.getElementById('round-result-overlay'),
      resultWinnerName: document.getElementById('round-winner-name'),
      resultRegionText: document.getElementById('round-conquered-text'),
      resultScoreGained: document.getElementById('round-score-text'),
      resultCorrectAns: document.getElementById('round-correct-answer'),
      btnNextQuestion: document.getElementById('btn-next-question'),
      
      // GameOver
      finalPodium: document.getElementById('final-podium'),
      finalRegions: document.getElementById('final-regions-summary'),
      btnNewGame: document.getElementById('btn-new-game')
    };

    this.allQuestionsData = null; // raw JSON
    this.selectedCategories = []; // category ids chosen in lobby
    this.currentAudio = null; // for sound playback

    this.init();
  }

  async init() {
    this.mapRenderer = new MapRenderer('map-container');
    await this.loadQuestions();
    this.setupFirebase();
    this.bindEvents();
    
    // Hide active region badge as it's no longer used
    if (this.els.regionBadge) this.els.regionBadge.style.display = 'none';

    // Wait for map to load before allowing start
    window.addEventListener('mapLoaded', () => {
      this.updateLobbyUI(); // Re-evaluates start button
    });
  }

  async loadQuestions() {
    try {
      const res = await fetch('data/questions.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      this.allQuestionsData = data;
      // Default: load all categories
      this.selectedCategories = data.categories.map(c => c.id);
      this.questionPool = buildQuestionPool(data, this.selectedCategories);
      this._allQuestions = [...this.questionPool];
      console.log(`[BvF] ${this.questionPool.length} Fragen geladen.`);

      // Show category modal
      this.showCategoryModal();
    } catch(e) {
      console.error('[BvF] Fragen konnten nicht geladen werden:', e);
      this.showToast('Fehler: Fragen nicht geladen!', 'error');
    }
  }

  async setupFirebase() {
    try {
      await auth.signInAnonymously();
      
      this.sessionRef = db.ref('sessions/' + this.hostId);
      this.playersRef = this.sessionRef.child('players');

      // Clear old session if exists, set initial state
      await this.sessionRef.set({
        state: 'lobby',
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });

      // Remove session when host disconnects
      this.sessionRef.onDisconnect().remove();

      this.els.hostId.textContent = this.hostId;
      this.generateQR(this.hostId);

      // Listen for players joining/updating
      this.playersRef.on('value', (snapshot) => {
        const data = snapshot.val() || {};
        
        // Check for new players or changes
        Object.keys(data).forEach(pid => {
          const pData = data[pid];
          if (!this.players[pid]) {
            // New player joined
            this.players[pid] = {
              name: pData.name,
              color: pData.color,
              score: 0,
              online: true,
              regions: 0,
              eliminated: false,
              _lastAnswerTimestamp: 0 // Track processed answers
            };
            this.updateLobbyUI();
          }

          // Handle incoming answers during question state
          if (this.state === 'question' && pData.answer && pData.answer.timestamp > this.players[pid]._lastAnswerTimestamp && !this.players[pid].eliminated) {
            this.players[pid]._lastAnswerTimestamp = pData.answer.timestamp;
            this.roundAnswers.push({
              playerId: pid,
              value: pData.answer.value,
              timestamp: pData.answer.timestamp,
              startTime: this.currentQuestion.startTime
            });
            
            const activePlayers = Object.values(this.players).filter(p => p.online && !p.eliminated).length;
            if (this.roundAnswers.length >= activePlayers) {
              this.endRound();
            }
          }
        });

        // Check for offline players (if they removed their node via onDisconnect)
        // Actually, we'll let controller handle its own presence or just assume they are online unless deleted
      });

    } catch (e) {
      console.error('[Firebase] Error:', e);
      this.showToast('Verbindungsfehler: ' + e.message, 'error');
    }
  }

  generateQR(id) {
    const url = new URL('controller.html', window.location.href);
    url.searchParams.set('host', id);
    this.els.qrCanvas.innerHTML = '';
    new QRCode(this.els.qrCanvas, {
      text: url.href,
      width: 200,
      height: 200,
      colorDark: '#0a0c14',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  updateLobbyUI() {
    const active = Object.values(this.players).filter(p => p.online);
    this.els.playerCount.textContent = active.length;
    
    this.els.btnStart.disabled = active.length < GameConfig.MIN_PLAYERS || !this.mapRenderer.isLoaded;
    if(active.length === 0) {
      this.els.playerList.innerHTML = '<div class="waiting-hint">Warte auf Spieler...</div>';
      return;
    }

    this.els.playerList.innerHTML = '';
    active.forEach(p => {
      const el = document.createElement('div');
      el.className = 'player-item';
      el.innerHTML = `
        <span class="color-dot" style="background:${p.color}"></span>
        <span class="player-item-name">${this.escapeHTML(p.name)}</span>
        <span class="player-item-status">Bereit</span>
      `;
      this.els.playerList.appendChild(el);
    });
  }

  bindEvents() {
    this.els.btnStart.addEventListener('click', () => this.startGame());
    this.els.btnNewGame.addEventListener('click', () => { window.location.reload(); });
    this.els.btnNextQuestion.addEventListener('click', () => this.advanceToNextRound());
  }

  showCategoryModal() {
    const categories = getCategories(this.allQuestionsData);
    const modal = document.createElement('div');
    modal.id = 'category-modal';
    modal.innerHTML = `
      <div class="cat-modal-backdrop"></div>
      <div class="cat-modal-card">
        <div class="cat-modal-header">
          <div class="cat-modal-icon">📚</div>
          <h2 class="cat-modal-title">Kategori Seçimi</h2>
          <p class="cat-modal-sub">Hangi kategorilerden soru gelsin?</p>
        </div>
        <div class="cat-modal-grid" id="cat-grid">
          ${categories.map(cat => `
            <label class="cat-chip selected" data-id="${cat.id}">
              <input type="checkbox" value="${cat.id}" checked hidden>
              <span class="cat-chip-icon">${cat.icon}</span>
              <div class="cat-chip-info">
                <span class="cat-chip-name">${cat.name}</span>
                ${cat.description ? `<span class="cat-chip-description">${cat.description}</span>` : ''}
              </div>
              <span class="cat-chip-count">${cat.count} Fragen</span>
              <span class="cat-chip-check">✓</span>
            </label>
          `).join('')}
        </div>
        <div class="cat-modal-footer">
          <span id="cat-selected-count" class="cat-count-text">${categories.length} Kategorie ausgewählt</span>
          <button id="btn-cat-confirm" class="btn btn-primary cat-confirm-btn">Bestätigen ✓</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Toggle selection
    modal.querySelectorAll('.cat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const checkbox = chip.querySelector('input');
        checkbox.checked = !checkbox.checked;
        chip.classList.toggle('selected', checkbox.checked);
        this._updateCatCount(modal, categories.length);
      });
    });

    document.getElementById('btn-cat-confirm').addEventListener('click', () => {
      const checked = [...modal.querySelectorAll('input[type=checkbox]:checked')].map(el => el.value);
      if (checked.length === 0) {
        this.showToast('Mindestens eine Kategorie auswählen!', 'error');
        return;
      }
      this.selectedCategories = checked;
      this.questionPool = buildQuestionPool(this.allQuestionsData, checked);
      this._allQuestions = [...this.questionPool];
      modal.remove();
      this.showToast(`${this.questionPool.length} Fragen aus ${checked.length} Kategorie(n) geladen.`, 'info');
    });
  }

  _updateCatCount(modal, total) {
    const checked = modal.querySelectorAll('input:checked').length;
    const el = document.getElementById('cat-selected-count');
    if (el) el.textContent = `${checked} von ${total} Kategorie(n) ausgewählt`;
  }

  showScreen(screenName) {
    Object.values(this.els.screens).forEach(s => {
      s.classList.remove('visible');
      s.classList.add('hidden');
    });
    this.els.screens[screenName].classList.remove('hidden');
    this.els.screens[screenName].classList.add('visible');
  }

  startGame() {
    if (!this.questionPool || this.questionPool.length === 0) {
      this.showToast('Kann nicht starten: Keine Fragen geladen!', 'error');
      return;
    }

    this.customDuration = parseInt(this.els.settingDuration.value, 10) || 0;

    this.state = 'lobby';
    this.roundNumber = 0;
    this.mapRenderer.reset();
    
    const activePlayerIds = Object.keys(this.players).filter(pid => this.players[pid].online);
    
    // Assign starting regions
    const startRegions = assignStartingRegions(activePlayerIds, this.mapRenderer.getAllRegionIds());
    Object.keys(startRegions).forEach(pid => {
      const p = this.players[pid];
      p.score = 0;
      p.eliminated = false;
      startRegions[pid].forEach(rid => {
        this.mapRenderer.conquerRegion(rid, pid, p.color, p.name);
      });
    });

    this.updateStats();
    this.updateScoreboard();

    this.showScreen('game');
    this.sessionRef.update({ state: 'game' });
    this.startNextRound();
  }

  startNextRound() {
    // Check if game is over (only 1 player left)
    const active = Object.values(this.players).filter(p => !p.eliminated && p.online);
    if (active.length <= 1 && Object.keys(this.players).length > 1) {
      this.endGame();
      return;
    }

    this.state = 'question';
    this.roundNumber++;
    this.roundAnswers = [];
    
    if (this.questionPool.length === 0) {
      if (this._allQuestions && this._allQuestions.length > 0) {
        this.questionPool = shuffle([...this._allQuestions]);
      } else {
        this.endGame();
        return;
      }
    }

    this.currentQuestion = this.questionPool.pop();
    this.currentQuestion.startTime = Date.now();
    
    // Override duration if custom setting is selected
    if (this.customDuration > 0) {
      this.currentQuestion.duration = this.customDuration;
    }

    this.els.roundCurrent.textContent = this.roundNumber;
    
    this.els.qCategoryIcon.textContent = this.currentQuestion.categoryIcon;
    this.els.qCategoryName.textContent = this.currentQuestion.categoryName;
    this.els.qCategoryDescription.textContent = this.currentQuestion.categoryDescription || "";
    
    // Hide description if empty to save space
    this.els.qCategoryDescription.style.display = this.currentQuestion.categoryDescription ? 'block' : 'none';
    
    this.els.qTypeBadge.className = 'q-type-badge ' + (this.currentQuestion.type === 'multiple_choice' ? 'q-type-mc' : 'q-type-num');
    this.els.qTypeBadge.textContent = this.currentQuestion.type === 'multiple_choice' ? 'Multiple Choice' : 'Zahl eingeben';
    
    this.els.qText.textContent = this.currentQuestion.text;
    document.getElementById('question-card').style.opacity = '1';
    
    this.els.qOptions.innerHTML = '';
    if (this.currentQuestion.type === 'multiple_choice') {
      this.els.qOptions.style.display = 'grid';
      const letters = ['A','B','C','D'];
      this.currentQuestion.options.forEach((opt, idx) => {
        const div = document.createElement('div');
        div.className = 'q-option';
        div.id = `q-opt-${idx}`;
        div.innerHTML = `<span class="q-option-letter">${letters[idx]}</span> <span class="q-option-text">${this.escapeHTML(opt)}</span>`;
        this.els.qOptions.appendChild(div);
      });
    } else {
      this.els.qOptions.style.display = 'none';
    }

    // Play sound if question has one
    this._playQuestionSound(this.currentQuestion);

    // Broadcast via Firebase
    this.sessionRef.update({
      state: 'question',
      questionData: {
        type: this.currentQuestion.type,
        text: this.currentQuestion.text,
        options: this.currentQuestion.options || [],
        duration: this.currentQuestion.duration,
        unit: this.currentQuestion.unit || null
      }
    });

    // Clear previous feedback and answers
    const updates = {};
    Object.keys(this.players).forEach(pid => {
      updates[`players/${pid}/feedback`] = null;
      updates[`players/${pid}/answer`] = null;
      if (this.players[pid].eliminated) {
        updates[`players/${pid}/feedback`] = { type: 'eliminated' };
      }
    });
    this.sessionRef.update(updates);

    this.startTimer(this.currentQuestion.duration);
  }

  _playQuestionSound(question) {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (question.sound) {
      const audio = new Audio(`assets/sounds/${question.sound}`);
      audio.play().catch(e => console.warn('[BvF] Ses çalınamadı:', e));
      this.currentAudio = audio;
    }
  }

  startTimer(durationSeconds) {
    this.els.countdownContainer.style.display = 'flex';
    let timeLeft = durationSeconds;
    this.els.timerText.textContent = timeLeft;
    this.els.timerCircle.style.strokeDashoffset = '0';
    this.els.timerCircle.style.stroke = 'var(--accent)';
    this.els.timerCircle.style.transition = 'stroke-dashoffset 1s linear, stroke 0.5s ease';

    clearInterval(this.roundTimer);
    this.els.timerCircle.getBoundingClientRect(); // Reflow

    this.roundTimer = setInterval(() => {
      timeLeft--;
      if(timeLeft >= 0) {
        this.els.timerText.textContent = timeLeft;
        const offset = 283 - (timeLeft / durationSeconds) * 283;
        this.els.timerCircle.style.strokeDashoffset = offset;
        
        if (timeLeft <= 5) this.els.timerCircle.style.stroke = 'var(--danger)';
        else if (timeLeft <= 10) this.els.timerCircle.style.stroke = 'var(--warning)';
      }
      
      if (timeLeft <= 0) this.endRound();
    }, 1000);
  }

  endRound() {
    if (this.state !== 'question') return;
    this.state = 'result';
    clearInterval(this.roundTimer);
    
    const { scores, expansions } = resolveRound(this.roundAnswers, this.currentQuestion);
    
    Object.keys(scores).forEach(pid => {
      if (this.players[pid]) this.players[pid].score += scores[pid];
    });

    // Expand logic: sort players by expansion count (highest wins = overwrites last)
    const expandingPlayers = Object.keys(expansions).sort((a, b) => (expansions[a] || 0) - (expansions[b] || 0));

    // Determine fastest correct player for UI
    const correctSorted = this.roundAnswers
      .filter(ans => scores[ans.playerId] > 0)
      .sort((a, b) => (a.timestamp - a.startTime) - (b.timestamp - b.startTime));
    const fastestPid = correctSorted.length > 0 ? correctSorted[0].playerId : null;

    const roundSummary = []; // Collect conquest texts

    for (const pid of expandingPlayers) {
      const expCount = expansions[pid];
      if (expCount > 0 && this.players[pid] && !this.players[pid].eliminated) {
        const targets = this.mapRenderer.findExpandableRegions(pid, expCount);
        targets.forEach(tid => {
          this.mapRenderer.conquerRegion(tid, pid, this.players[pid].color, this.players[pid].name);
          roundSummary.push(`<span style="color:${this.players[pid].color}">${this.players[pid].name}</span> eroberte <b>${this.mapRenderer.getRegionName(tid)}</b>!`);
        });
      }
    }

    this.updateStats(); // Updates region counts & eliminations
    this.updateScoreboard();

    if (this.currentQuestion.type === 'multiple_choice') {
      const correctOpt = document.getElementById(`q-opt-${this.currentQuestion.answer}`);
      if (correctOpt) correctOpt.classList.add('correct');
    }

    let correctDisplay = this.currentQuestion.type === 'multiple_choice' 
      ? this.currentQuestion.options[this.currentQuestion.answer] 
      : this.currentQuestion.answer + (this.currentQuestion.unit ? ' ' + this.currentQuestion.unit : '');

    // Send results to controllers via Firebase
    const updates = { state: 'result' };
    Object.keys(this.players).forEach(pid => {
      const pScore = scores[pid] || 0;
      const pExp = expansions[pid] || 0;
      const p = this.players[pid];
      if (!p) return;

      let fbType = 'lost';
      if (p.eliminated) fbType = 'eliminated';
      else if (pid === fastestPid) fbType = 'won'; // Fastest correct answer
      else if (pScore > 0) fbType = 'close'; // Correct but not fastest

      updates[`players/${pid}/feedback`] = {
        type: fbType,
        scoreGained: pScore,
        expansionGained: pExp,
        correctAnswer: correctDisplay,
        winnerName: fastestPid && this.players[fastestPid] ? this.players[fastestPid].name : 'Niemand'
      };
    });
    this.sessionRef.update(updates);

    // Update overlay UI — show fastest correct player
    if (fastestPid && this.players[fastestPid]) {
      const fp = this.players[fastestPid];
      this.els.resultWinnerName.textContent = `⚡ ${fp.name}`;
      this.els.resultWinnerName.style.color = fp.color;
    } else {
      this.els.resultWinnerName.textContent = 'Niemand lag richtig.';
      this.els.resultWinnerName.style.color = 'var(--text-primary)';
    }
    
    // Build a summary text for conquests
    if (roundSummary.length > 0) {
      const maxDisplay = 5;
      const displaySummary = roundSummary.slice(0, maxDisplay);
      if (roundSummary.length > maxDisplay) {
        displaySummary.push(`... und ${roundSummary.length - maxDisplay} weitere!`);
      }
      this.els.resultRegionText.innerHTML = displaySummary.join('<br>');
    } else {
      this.els.resultRegionText.innerHTML = 'Niemand konnte expandieren.';
    }
    
    this.els.resultScoreGained.textContent = ''; // Removed since everyone gets points
    this.els.resultCorrectAns.textContent = `Richtige Antwort: ${correctDisplay}`;
    
    this.els.resultOverlay.classList.add('visible');
  }

  updateStats() {
    const stats = this.mapRenderer.getStats();
    Object.keys(this.players).forEach(pid => {
      const p = this.players[pid];
      if (!p) return;
      const count = stats[pid] ? stats[pid].count : 0;
      p.regions = count;
      if (count === 0 && this.roundNumber > 0 && !p.eliminated) {
        p.eliminated = true;
        this.showToast(`${p.name} wurde eliminiert!`, 'error');
      }
    });
  }

  advanceToNextRound() {
    this.els.resultOverlay.classList.remove('visible');
    document.getElementById('question-card').style.opacity = '0.5';
    this.els.countdownContainer.style.display = 'none';
    if (this.currentQuestion && this.currentQuestion.type === 'multiple_choice') {
      document.querySelectorAll('.q-option').forEach(el => el.classList.remove('correct'));
    }
    this.startNextRound();
  }

  updateScoreboard() {
    const sorted = Object.values(this.players)
      .sort((a, b) => b.score - a.score || b.regions - a.regions);
    
    this.els.scoreboard.innerHTML = '';
    sorted.forEach((p, idx) => {
      const el = document.createElement('div');
      el.className = 'score-item';
      if (p.eliminated) el.style.opacity = '0.4';
      
      el.innerHTML = `
        <span class="score-rank score-rank-${idx+1}">${idx+1}</span>
        <span class="color-dot" style="background:${p.color}; width:8px; height:8px;"></span>
        <span class="score-name" style="${p.eliminated ? 'text-decoration: line-through;' : ''}">${this.escapeHTML(p.name)}</span>
        <span class="score-regions">📍${p.regions}</span>
        <span class="score-value">${p.score}</span>
      `;
      this.els.scoreboard.appendChild(el);
    });
  }

  endGame() {
    this.state = 'gameover';
    const sorted = Object.values(this.players).sort((a, b) => b.regions - a.regions || b.score - a.score);
    
    this.sessionRef.update({ state: 'gameover' });

    const updates = {};
    Object.keys(this.players).forEach(pid => {
      const p = this.players[pid];
      const rank = sorted.findIndex(sp => sp === p) + 1;
      updates[`players/${pid}/gameover`] = {
        rank: rank,
        score: p.score
      };
    });
    this.sessionRef.update(updates);

    this.els.finalPodium.innerHTML = '';
    sorted.slice(0, 3).forEach((p, idx) => {
      const el = document.createElement('div');
      el.className = 'podium-item';
      el.innerHTML = `
        <div class="podium-rank">#${idx+1}</div>
        <div class="podium-info">
          <div class="podium-name" style="color:${p.color}">${this.escapeHTML(p.name)}</div>
          <div class="podium-stats">${p.regions} Regionen erobert</div>
        </div>
        <div class="podium-score">${p.score}</div>
      `;
      this.els.finalPodium.appendChild(el);
    });

    const stats = this.mapRenderer.getStats();
    this.els.finalRegions.innerHTML = '';
    Object.values(stats).sort((a,b)=>b.count - a.count).forEach(s => {
      const el = document.createElement('div');
      el.className = 'conquest-chip';
      el.style.background = s.color;
      el.style.color = '#fff'; 
      el.innerHTML = `${this.escapeHTML(s.name)} <strong>${s.count}</strong>`;
      this.els.finalRegions.appendChild(el);
    });

    const goMap = document.getElementById('gameover-map-container');
    goMap.innerHTML = '';
    const clonedSvg = this.mapRenderer.svg.cloneNode(true);
    clonedSvg.removeAttribute('id');
    goMap.appendChild(clonedSvg);

    this.showScreen('gameover');
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

  escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        }[tag]));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.boardApp = new BoardApp();
});
