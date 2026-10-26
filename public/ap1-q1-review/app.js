/* AP Physics 1 Q1 Review */
(function () {
  'use strict';

  var LS_KEY = 'ap1-q1-review-v1';
  var viewEl = document.getElementById('view');
  var saveStatusEl = document.getElementById('save-status');
  var standaloneNotice = document.getElementById('standalone-notice');
  var errorState = document.getElementById('error-state');
  var errorMessage = document.getElementById('error-message');

  var state = {
    skills: [],
    practice: [],
    mock: null,
    mastery: {},
    practiceSessions: {},
    mockAnswers: {},
    mockFrqResponses: {},
    mockFrqSelfScores: {},
    mockComplete: false,
    standaloneDismissed: false
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, delay);
    };
  }

  function setStatus(text, color) {
    if (!saveStatusEl) return;
    saveStatusEl.textContent = text || '';
    saveStatusEl.style.color = color || '';
  }

  function serialize() {
    return {
      mastery: state.mastery,
      practiceSessions: state.practiceSessions,
      mockAnswers: state.mockAnswers,
      mockFrqResponses: state.mockFrqResponses,
      mockFrqSelfScores: state.mockFrqSelfScores,
      mockComplete: state.mockComplete,
      standaloneDismissed: state.standaloneDismissed
    };
  }

  function persist() {
    var payload = serialize();
    try { localStorage.setItem(LS_KEY, JSON.stringify(payload)); } catch (e) {}
    if (window.PortalBridge && window.PortalBridge.connected) {
      window.PortalBridge.save({ state: payload });
      setStatus('Saved', '#4ade80');
      setTimeout(function () { setStatus(''); }, 1200);
    } else {
      setStatus('Local', '#a0a0b0');
      setTimeout(function () { setStatus(''); }, 1200);
    }
  }

  var persistSoon = debounce(persist, 500);

  function restore(payload) {
    var saved = payload && payload.state ? payload.state : payload;
    if (!saved || typeof saved !== 'object') return;
    ['mastery', 'practiceSessions', 'mockAnswers', 'mockFrqResponses', 'mockFrqSelfScores'].forEach(function (key) {
      if (saved[key] && typeof saved[key] === 'object') state[key] = saved[key];
    });
    state.mockComplete = !!saved.mockComplete;
    state.standaloneDismissed = !!saved.standaloneDismissed;
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function answerArray(item) {
    return Array.isArray(item.answer) ? item.answer.slice() : [item.answer];
  }

  function sameAnswers(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    var aa = a.slice().sort(function (x, y) { return x - y; });
    var bb = b.slice().sort(function (x, y) { return x - y; });
    return aa.every(function (v, i) { return v === bb[i]; });
  }

  function skillById(id) {
    return state.skills.find(function (s) { return s.id === id; }) || { id: id, label: id, chapter: '' };
  }

  function practiceForSkill(skillId) {
    return state.practice.filter(function (item) { return item.skill === skillId; });
  }

  function getMastery(skillId) {
    if (!state.mastery[skillId]) {
      state.mastery[skillId] = { attempts: {}, currentStreak: 0, bestStreak: 0 };
    }
    var m = state.mastery[skillId];
    if (!m.attempts) m.attempts = {};
    return m;
  }

  function masteryScore(skillId) {
    var m = getMastery(skillId);
    var records = Object.keys(m.attempts).map(function (k) { return m.attempts[k]; });
    var firstTotal = records.length;
    var firstCorrect = records.filter(function (r) { return r.correctFirst; }).length;
    var accuracy = firstTotal ? firstCorrect / firstTotal : 0;
    var streak = Math.min(m.bestStreak || 0, 3) / 3;
    return Math.round((accuracy * 0.7 + streak * 0.3) * 100);
  }

  function answeredCount(skillId) {
    return Object.keys(getMastery(skillId).attempts).length;
  }

  function overallMastery() {
    if (!state.skills.length) return 0;
    return Math.round(state.skills.reduce(function (sum, s) { return sum + masteryScore(s.id); }, 0) / state.skills.length);
  }

  function weakestSkill() {
    var best = state.skills[0];
    var bestScore = Infinity;
    state.skills.forEach(function (s) {
      var score = masteryScore(s.id);
      if (answeredCount(s.id) === 0) score -= 1;
      if (score < bestScore) { best = s; bestScore = score; }
    });
    return best;
  }

  function setView(html) {
    errorState.hidden = true;
    viewEl.hidden = false;
    viewEl.replaceChildren();
    viewEl.insertAdjacentHTML('beforeend', html);
    viewEl.classList.remove('view-enter');
    void viewEl.offsetWidth;
    viewEl.classList.add('view-enter');
    viewEl.focus({ preventScroll: true });
  }

  function showError(err) {
    viewEl.hidden = true;
    errorState.hidden = false;
    errorMessage.textContent = err && err.message ? err.message : String(err);
  }

  function figureHtml(item) {
    if (item.figureSvg) {
      return '<div class="figure-wrap" role="img" aria-label="' + esc(item.figureAlt || 'Question figure') + '">' + item.figureSvg + '</div>';
    }
    if (item.figure) {
      return '<div class="figure-wrap"><img src="' + esc(item.figure) + '" alt="' + esc(item.figureAlt || 'Question figure') + '"></div>';
    }
    return '';
  }

  // Numeric data tables belong in a real <table>, not flattened into the stem.
  function tableHtml(item) {
    if (!item.table || !item.table.headers || !item.table.rows) return '';
    var head = '<tr>' + item.table.headers.map(function (h) {
      return '<th scope="col">' + esc(h) + '</th>';
    }).join('') + '</tr>';
    var body = item.table.rows.map(function (row) {
      return '<tr>' + row.map(function (cell, i) {
        return i === 0 ? '<th scope="row">' + esc(cell) + '</th>' : '<td>' + esc(cell) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table class="data-table"><caption class="data-table-caption">Component choices</caption>' +
      '<thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function optionButtons(item, selected, locked, reveal) {
    var answers = answerArray(item);
    return item.options.map(function (text, i) {
      var cls = 'option-btn';
      if (reveal && answers.indexOf(i) >= 0) cls += ' correct';
      if (reveal && selected.indexOf(i) >= 0 && answers.indexOf(i) < 0) cls += ' incorrect';
      var pressed = selected.indexOf(i) >= 0;
      return '<button type="button" class="' + cls + '" data-option="' + i + '" aria-pressed="' + pressed + '" ' + (locked ? 'disabled' : '') + '>' +
        '<span class="option-letter">' + String.fromCharCode(65 + i) + '</span><span>' + esc(text) + '</span></button>';
    }).join('');
  }

  function renderHome() {
    var overall = overallMastery();
    var weakest = weakestSkill();
    var attempted = state.skills.reduce(function (n, s) { return n + answeredCount(s.id); }, 0);
    var html = '<section class="hero"><h1>Quarter 1 Review</h1><p class="hero-sub">Practice the skills from Chapters 2 through 4, then take a fresh mock quarterly. The questions are new versions, not the exam questions.</p></section>';
    html += '<section class="card"><div class="mastery-hero"><div><div class="mastery-big">' + overall + '%</div><div class="mastery-label">Overall mastery</div></div>' +
      '<div class="mastery-hero-info"><h2>Build your streak</h2><p class="muted">Practice answers give immediate feedback. The mock stays blind until the report.</p>' +
      '<div class="progress-counts"><div class="progress-count"><div class="progress-count-num">' + attempted + '</div><div class="progress-count-label">Practice answers</div></div>' +
      '<div class="progress-count"><div class="progress-count-num">' + Object.keys(state.mockAnswers).length + '/30</div><div class="progress-count-label">Mock MC</div></div>' +
      '<div class="progress-count"><div class="progress-count-num">' + (state.mockComplete ? 'Done' : 'Open') + '</div><div class="progress-count-label">Mock status</div></div></div></div></div></section>';
    html += '<div class="recommend-banner"><div class="recommend-banner-text"><strong>Recommended:</strong> ' + esc(weakest.label) + '</div><a class="btn btn-primary" href="#/practice/' + esc(weakest.id) + '">Practice weakest skill</a><a class="btn" href="#/mock">Open mock quarterly</a></div>';
    html += '<section class="skill-grid">' + state.skills.map(function (s) {
      var score = masteryScore(s.id);
      var count = answeredCount(s.id);
      return '<article class="skill-card"><div class="skill-card-header"><div><div class="skill-label">' + esc(s.label) + '</div><div class="skill-chapter">' + esc(s.chapter) + '</div></div><div class="skill-mastery">' + score + '%</div></div>' +
        '<div class="skill-bar"><div class="skill-bar-fill" style="width:' + score + '%"></div></div><div class="skill-progress">' + count + ' of 8 tried · best streak ' + (getMastery(s.id).bestStreak || 0) + '</div>' +
        '<p class="muted">' + esc(s.description) + '</p><a class="btn btn-sm skill-practice-btn" href="#/practice/' + esc(s.id) + '">Practice</a></article>';
    }).join('') + '</section>';
    setView(html);
  }

  function sessionFor(skillId) {
    if (!state.practiceSessions[skillId]) state.practiceSessions[skillId] = { index: 0, selected: [], submitted: false };
    return state.practiceSessions[skillId];
  }

  function renderPractice(skillId) {
    var skill = skillById(skillId);
    var items = practiceForSkill(skillId);
    if (!items.length) { renderHome(); return; }
    var session = sessionFor(skillId);
    if (session.index >= items.length) session.index = 0;
    var item = items[session.index];
    var answers = answerArray(item);
    var selected = session.selected || [];
    var submitted = !!session.submitted;
    var correct = submitted && sameAnswers(selected, answers);
    var html = '<section class="card practice"><div class="practice-meta"><span class="practice-skill-badge">' + esc(skill.label) + '</span><span class="practice-progress-text">Question ' + (session.index + 1) + ' of ' + items.length + ' · mastery ' + masteryScore(skillId) + '%</span></div>' +
      '<div class="stem">' + esc(item.stem) + '</div>' + figureHtml(item) + tableHtml(item);
    if (item.type === 'multi-select') html += '<div class="multi-select-hint">Select ' + answers.length + ' answers.</div>';
    html += '<div class="options-list">' + optionButtons(item, selected, submitted, submitted) + '</div>';
    if (submitted) {
      var wrongFeedback = selected.filter(function (i) { return answers.indexOf(i) < 0; }).map(function (i) { return item.feedback && item.feedback[String(i)]; }).filter(Boolean);
      html += '<div class="feedback-panel ' + (correct ? 'correct' : 'incorrect') + '"><div class="feedback-title">' + (correct ? 'Correct' : 'Not yet') + '</div><div class="feedback-body"><p>' + esc(item.explanation) + '</p>' + wrongFeedback.map(function (f) { return '<p>' + esc(f) + '</p>'; }).join('') + '</div></div>';
    }
    html += '<div class="practice-actions"><a class="btn btn-ghost" href="#/">Skills</a>';
    if (!submitted) html += '<button type="button" class="btn btn-primary" id="submit-practice" ' + (selected.length ? '' : 'disabled') + '>Check answer</button>';
    if (submitted && !correct) html += '<button type="button" class="btn" id="retry-practice">Try again</button>';
    if (submitted) html += '<button type="button" class="btn btn-primary" id="next-practice">' + (session.index === items.length - 1 ? 'Review again' : 'Next question') + '</button>';
    html += '</div></section>';
    setView(html);

    viewEl.querySelectorAll('[data-option]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.dataset.option);
        var sel = session.selected || [];
        if (item.type === 'multi-select') {
          session.selected = sel.indexOf(idx) >= 0 ? sel.filter(function (v) { return v !== idx; }) : sel.concat(idx);
        } else {
          session.selected = [idx];
        }
        renderPractice(skillId);
      });
    });
    var submit = document.getElementById('submit-practice');
    if (submit) submit.addEventListener('click', function () {
      session.submitted = true;
      var isCorrect = sameAnswers(session.selected || [], answers);
      var m = getMastery(skillId);
      if (!m.attempts[item.id]) m.attempts[item.id] = { correctFirst: isCorrect, correct: isCorrect };
      if (isCorrect) {
        m.currentStreak = (m.currentStreak || 0) + 1;
        m.bestStreak = Math.max(m.bestStreak || 0, m.currentStreak);
      } else {
        m.currentStreak = 0;
      }
      if (window.PortalBridge && window.PortalBridge.connected) window.PortalBridge.reportAnswer(item.id, isCorrect, 1);
      persistSoon();
      renderPractice(skillId);
    });
    var retry = document.getElementById('retry-practice');
    if (retry) retry.addEventListener('click', function () {
      session.submitted = false;
      session.selected = [];
      renderPractice(skillId);
    });
    var next = document.getElementById('next-practice');
    if (next) next.addEventListener('click', function () {
      session.index = (session.index + 1) % items.length;
      session.selected = [];
      session.submitted = false;
      persistSoon();
      renderPractice(skillId);
    });
  }

  function renderMockIntro() {
    var answered = Object.keys(state.mockAnswers).length;
    var html = '<section class="card"><h1>Mock Quarterly</h1><p class="hero-sub">Exam-shaped practice with new questions. Suggested pacing is 60 minutes for Section I and 20 minutes for Section II, but nothing shuts off.</p>' +
      '<div class="mock-intro-facts"><div class="mock-fact"><div class="mock-fact-num">30</div><div class="mock-fact-label">MC questions</div></div><div class="mock-fact"><div class="mock-fact-num">5</div><div class="mock-fact-label">FRQ parts</div></div><div class="mock-fact"><div class="mock-fact-num">40</div><div class="mock-fact-label">Points</div></div><div class="mock-fact"><div class="mock-fact-num">4</div><div class="mock-fact-label">Multi-select</div></div></div>' +
      '<div class="pacing-note">Answers stay hidden until the report. You can leave and come back.</div>' +
      '<div class="practice-actions"><a class="btn btn-ghost" href="#/">Skills</a><a class="btn btn-primary" href="#/mock/mc/0">' + (answered ? 'Resume mock' : 'Start mock') + '</a></div></section>';
    setView(html);
  }

  function renderMockMC(index) {
    var items = state.mock.mc;
    index = Math.max(0, Math.min(index || 0, items.length - 1));
    var item = items[index];
    var selected = state.mockAnswers[item.id] || [];
    var answers = answerArray(item);
    var dots = items.map(function (q, i) {
      return '<button type="button" class="mock-dot' + (state.mockAnswers[q.id] ? ' answered' : '') + (i === index ? ' current' : '') + '" data-jump="' + i + '" aria-label="Question ' + (i + 1) + '">' + (i + 1) + '</button>';
    }).join('');
    var html = '<section class="card"><div class="practice-meta"><span class="practice-skill-badge">Section I</span><span class="practice-progress-text">Question ' + (index + 1) + ' of 30</span></div>' +
      '<div class="mock-progress-dots">' + dots + '</div><div class="stem">' + esc(item.stem) + '</div>' + figureHtml(item) + tableHtml(item);
    if (item.type === 'multi-select') html += '<div class="multi-select-hint">Select ' + answers.length + ' answers.</div>';
    html += '<div class="options-list">' + optionButtons(item, selected, false, false) + '</div>' +
      '<div class="mock-nav"><a class="btn btn-ghost" href="#/mock">Mock home</a><span><button type="button" class="btn" id="mock-prev" ' + (index === 0 ? 'disabled' : '') + '>Previous</button> <button type="button" class="btn btn-primary" id="mock-next">' + (index === items.length - 1 ? 'Go to Section II' : 'Next') + '</button></span></div></section>';
    setView(html);
    viewEl.querySelectorAll('[data-option]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.dataset.option);
        var sel = state.mockAnswers[item.id] || [];
        if (item.type === 'multi-select') sel = sel.indexOf(idx) >= 0 ? sel.filter(function (v) { return v !== idx; }) : sel.concat(idx);
        else sel = [idx];
        state.mockAnswers[item.id] = sel;
        persistSoon();
        renderMockMC(index);
      });
    });
    viewEl.querySelectorAll('[data-jump]').forEach(function (btn) { btn.addEventListener('click', function () { location.hash = '#/mock/mc/' + btn.dataset.jump; }); });
    document.getElementById('mock-prev').addEventListener('click', function () { location.hash = '#/mock/mc/' + (index - 1); });
    document.getElementById('mock-next').addEventListener('click', function () {
      location.hash = index === items.length - 1 ? '#/mock/frq' : '#/mock/mc/' + (index + 1);
    });
  }

  function renderMockFRQ() {
    var frq = state.mock.frq;
    var html = '<section class="card"><div class="practice-meta"><span class="practice-skill-badge">Section II</span><span class="practice-progress-text">5 parts · self-scored at the report</span></div><h2>Free Response</h2><p>' + esc(frq.prompt) + '</p>';
    frq.parts.forEach(function (part) {
      var value = state.mockFrqResponses[part.label] || '';
      html += '<div class="frq-part"><span class="frq-part-label">Part ' + esc(part.label) + '</span><div class="frq-part-prompt">' + esc(part.prompt) + '</div><textarea class="frq-textarea" data-part="' + esc(part.label) + '" placeholder="Write your response here.">' + esc(value) + '</textarea></div>';
    });
    html += '<div class="mock-nav"><a class="btn btn-ghost" href="#/mock/mc/29">Back to Section I</a><a class="btn btn-primary" href="#/mock/report">Open report</a></div></section>';
    setView(html);
    viewEl.querySelectorAll('.frq-textarea').forEach(function (ta) {
      ta.addEventListener('input', function () {
        state.mockFrqResponses[ta.dataset.part] = ta.value;
        persistSoon();
      });
    });
  }

  function mockScore() {
    var perSkill = {};
    var mcEarned = 0;
    state.mock.mc.forEach(function (item) {
      var selected = state.mockAnswers[item.id] || [];
      var correct = sameAnswers(selected, answerArray(item));
      if (correct) mcEarned++;
      if (!perSkill[item.skill]) perSkill[item.skill] = { earned: 0, total: 0 };
      perSkill[item.skill].total++;
      if (correct) perSkill[item.skill].earned++;
    });
    var frqEarned = state.mock.frq.parts.reduce(function (sum, part) { return sum + Number(state.mockFrqSelfScores[part.label] || 0); }, 0);
    return { mcEarned: mcEarned, frqEarned: frqEarned, total: mcEarned + frqEarned, perSkill: perSkill };
  }

  function renderMockReport() {
    var score = mockScore();
    var html = '<section class="card report-score"><div class="report-score-num">' + score.total + '<span class="report-score-total">/40</span></div><div class="report-score-label">Mock score</div></section>';
    html += '<section class="card"><div class="report-section-title">Section I by skill</div>' + Object.keys(score.perSkill).map(function (sid) {
      var row = score.perSkill[sid];
      var good = row.earned / row.total >= 0.7;
      return '<div class="report-skill-row"><span class="report-skill-name">' + esc(skillById(sid).label) + '</span><span class="report-skill-result ' + (good ? 'good' : 'bad') + '">' + row.earned + '/' + row.total + '</span></div>';
    }).join('') + '</section>';
    html += '<section class="card"><div class="report-section-title">Section II self-score</div><p class="muted">Read your response and the checklist, then choose 0, 1, or 2 points for each part.</p>' + state.mock.frq.parts.map(function (part) {
      var response = state.mockFrqResponses[part.label] || 'No response entered.';
      var selected = state.mockFrqSelfScores[part.label];
      return '<div class="frq-selfscore"><div class="frq-selfscore-label">' + esc(part.label) + '</div><div class="frq-selfscore-body"><div class="frq-response-recall">' + esc(response) + '</div><div class="frq-selfscore-checklist"><strong>Checklist</strong><ul>' + part.checklist.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div></div><div class="score-btns">' + [0, 1, 2].map(function (n) { return '<button type="button" class="score-btn' + (selected === n ? ' selected' : '') + '" data-part="' + esc(part.label) + '" data-score="' + n + '">' + n + '</button>'; }).join('') + '</div></div>';
    }).join('') + '<div class="report-actions"><a class="btn btn-ghost" href="#/">Skills</a><a class="btn" href="#/mock/frq">Edit responses</a></div><div class="report-actions report-actions-danger"><button type="button" class="btn btn-danger" id="restart-mock">Restart mock</button><span class="muted">Clears every answer and starts over.</span></div></section>';
    setView(html);
    viewEl.querySelectorAll('.score-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.mockFrqSelfScores[btn.dataset.part] = Number(btn.dataset.score);
        var complete = state.mock.frq.parts.every(function (part) { return state.mockFrqSelfScores[part.label] !== undefined; });
        if (complete && !state.mockComplete) {
          state.mockComplete = true;
          var finalScore = mockScore();
          state.mock.mc.forEach(function (item) {
            if (window.PortalBridge && window.PortalBridge.connected) {
              window.PortalBridge.reportAnswer('mock-' + item.id, sameAnswers(state.mockAnswers[item.id] || [], answerArray(item)), 1);
            }
          });
          if (window.PortalBridge && window.PortalBridge.connected) window.PortalBridge.complete(finalScore.total, 40, finalScore.total);
        }
        persistSoon();
        renderMockReport();
      });
    });
    document.getElementById('restart-mock').addEventListener('click', function () {
      state.mockAnswers = {};
      state.mockFrqResponses = {};
      state.mockFrqSelfScores = {};
      state.mockComplete = false;
      persistSoon();
      location.hash = '#/mock';
    });
  }

  function navigate() {
    var parts = (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!parts.length) return renderHome();
    if (parts[0] === 'practice') return renderPractice(parts[1]);
    if (parts[0] === 'mock' && parts[1] === 'mc') return renderMockMC(Number(parts[2] || 0));
    if (parts[0] === 'mock' && parts[1] === 'frq') return renderMockFRQ();
    if (parts[0] === 'mock' && parts[1] === 'report') return renderMockReport();
    if (parts[0] === 'mock') return renderMockIntro();
    renderHome();
  }

  function loadJSON(path) {
    return fetch(path).then(function (res) {
      if (!res.ok) throw new Error('Could not load ' + path + ' (' + res.status + ')');
      return res.json();
    });
  }

  function updateStandaloneNotice() {
    var standalone = !(window.PortalBridge && window.PortalBridge.connected);
    standaloneNotice.hidden = standaloneDismissedSafe() || !standalone;
  }

  function standaloneDismissedSafe() {
    return !!state.standaloneDismissed;
  }

  function boot() {
    restore(loadLocal());
    Promise.all([loadJSON('data/skills.json'), loadJSON('data/practice.json'), loadJSON('data/mock.json')]).then(function (results) {
      state.skills = results[0];
      state.practice = results[1];
      state.mock = results[2];
      if (window.PortalBridge && window.parent !== window) {
        window.PortalBridge.init({
          onLoad: function (savedState) {
            restore(savedState);
            updateStandaloneNotice();
            navigate();
          },
          onReset: function () {
            state.mastery = {};
            state.practiceSessions = {};
            state.mockAnswers = {};
            state.mockFrqResponses = {};
            state.mockFrqSelfScores = {};
            state.mockComplete = false;
            persistSoon();
            navigate();
          }
        });
      }
      updateStandaloneNotice();
      navigate();
    }).catch(showError);
  }

  document.getElementById('dismiss-standalone').addEventListener('click', function () {
    state.standaloneDismissed = true;
    updateStandaloneNotice();
    persistSoon();
  });
  document.getElementById('error-retry').addEventListener('click', boot);
  window.addEventListener('hashchange', navigate);
  window.addEventListener('load', boot);
})();
