// ============================================================
// PORTER'S PORTAL — Practice Set Bridge (portalBridge.js)
// ============================================================
//
// DROP-IN REPLACEMENT for Firebase in HTML practice sets.
//
// Instead of including Firebase SDK + your own save logic, include this
// single script. It communicates with the Porter's Portal parent app
// via postMessage to handle saving, loading, XP awards, and completions.
//
// USAGE IN YOUR HTML FILE:
// ─────────────────────────────────────────────────────────────
// 1. Remove all Firebase script tags and config
// 2. Add this script tag instead:
//    <script src="https://porters-portal.web.app/portalBridge.js"></script>
//
// 3. Replace your initFirebase/saveToFirebase/loadFromFirebase with:
//
//    window.onload = () => {
//        PortalBridge.init({
//            onLoad: (savedState, completionInfo) => {
//                // savedState: { state: {...}, currentQuestion: N } or null
//                // completionInfo: { completed, completedAt, bestScore, totalCompletions } or null
//                if (savedState && savedState.state) {
//                    state = savedState.state;
//                    curIdx = savedState.currentQuestion || 0;
//                    renderSidebar();
//                    loadQ(curIdx);
//                }
//                if (completionInfo && completionInfo.completed) {
//                    // Student has completed before — show a badge or "replay" option
//                }
//            },
//            onReset: () => {
//                // Called when the student chooses to replay. Reset your UI to fresh state.
//                state = getDefaultState();
//                curIdx = 0;
//                renderSidebar();
//                loadQ(0);
//            }
//        });
//    };
//
//    // When student answers a question:
//    PortalBridge.reportAnswer(questionId, isCorrect, attemptCount);
//
//    // When you want to save progress:
//    PortalBridge.save({ state: state, currentQuestion: curIdx });
//
//    // When the student completes the entire module:
//    PortalBridge.complete(score, totalQuestions, correctAnswers);
//    // This creates a PERMANENT completion record. Progress is never lost.
//
//    // When the student wants to replay from within the HTML:
//    PortalBridge.replay();
//    // This resets active state but preserves completion records.
//    // Your onReset callback will fire after the reset is processed.
//
//    // Save status element (optional):
//    // PortalBridge will auto-update an element with id="save-status"
// ─────────────────────────────────────────────────────────────

(function() {
    'use strict';

    // Dynamically discovered from the portal-init handshake.
    // We no longer hardcode a single origin so .web.app, .firebaseapp.com,
    // and localhost all work automatically.
    var _parentOrigin = null;
    var saveStatusEl = null;
    var _onLoad = null;
    var _onReset = null;
    var _saveTimeout = null;
    var _readyInterval = null;
    var _onLoadFired = false;

    function updateStatus(text, color) {
        if (!saveStatusEl) saveStatusEl = document.getElementById('save-status');
        if (saveStatusEl) {
            saveStatusEl.innerText = text;
            saveStatusEl.style.color = color || '#888';
        }
    }

    // Validate that a message origin looks like a legitimate Portal parent.
    // Accepts porters-portal on .web.app, .firebaseapp.com, and localhost dev.
    function isAllowedOrigin(origin) {
        if (_parentOrigin) return origin === _parentOrigin;
        return /^https:\/\/porters-portal\.(web\.app|firebaseapp\.com)$/.test(origin)
            || /^http:\/\/localhost(:\d+)?$/.test(origin);
    }

    // Send a message to the parent using the discovered origin (or '*' during handshake).
    function sendToParent(msg) {
        window.parent.postMessage(msg, _parentOrigin || '*');
    }

    var PortalBridge = {
        connected: false,
        userId: null,
        completionInfo: null,

        /**
         * Initialize the bridge. Call this on window.onload.
         * @param {Object} opts
         * @param {Function} opts.onLoad - Called with (savedState, completionInfo) when parent sends saved data.
         *                                 savedState is null if no saved progress exists.
         *                                 completionInfo is null if module never completed.
         * @param {Function} opts.onReset - Called when a replay is initiated. Reset your UI to fresh state.
         */
        init: function(opts) {
            opts = opts || {};
            _onLoad = opts.onLoad || null;
            _onReset = opts.onReset || null;

            // Listen for messages from parent
            window.addEventListener('message', function(event) {
                var data = event.data;
                if (!data || typeof data !== 'object') return;

                // portal-init is the handshake — discover + lock the parent origin
                if (data.type === 'portal-init') {
                    if (!isAllowedOrigin(event.origin)) return;
                    _parentOrigin = event.origin;
                    clearInterval(_readyInterval);
                    PortalBridge.connected = true;
                    PortalBridge.userId = data.payload.userId;
                    PortalBridge.completionInfo = data.payload.completionInfo || null;
                    updateStatus('Connected', '#4ade80');
                    if (_onLoad && !_onLoadFired) {
                        _onLoadFired = true;
                        _onLoad(data.payload.savedState, data.payload.completionInfo);
                    }
                    return;
                }

                // All other messages must come from the locked parent origin
                if (!_parentOrigin || event.origin !== _parentOrigin) return;

                switch(data.type) {
                    case 'portal-save-ok':
                        updateStatus('Saved', '#4ade80');
                        setTimeout(function() { updateStatus('', '#888'); }, 2000);
                        break;

                    case 'portal-save-error':
                        updateStatus('Save Failed', '#ef4444');
                        break;

                    case 'portal-complete-ok':
                        PortalBridge.completionInfo = {
                            completed: true,
                            totalCompletions: data.payload.totalCompletions,
                            bestScore: data.payload.bestScore
                        };
                        updateStatus('Completed!', '#4ade80');
                        setTimeout(function() { updateStatus('', '#888'); }, 3000);
                        break;

                    case 'portal-complete-error':
                        updateStatus('Completion save failed', '#ef4444');
                        break;

                    case 'portal-reset-ok':
                        // Replay processed — call onReset so the HTML can reinitialize
                        updateStatus('Replaying...', '#60a5fa');
                        setTimeout(function() { updateStatus('', '#888'); }, 2000);
                        if (_onReset) {
                            _onReset();
                        }
                        break;

                    case 'portal-xp-result':
                        // Optional: HTML file can listen for this to show custom feedback
                        if (data.payload && data.payload.awarded) {
                            updateStatus('+' + data.payload.xp + ' XP!', '#fbbf24');
                            setTimeout(function() { updateStatus('', '#888'); }, 2500);
                        }
                        break;
                }
            });

            // Auto-save on page unload
            window.addEventListener('beforeunload', function() {
                if (PortalBridge._lastState) {
                    PortalBridge.save(PortalBridge._lastState);
                }
            });

            // Tell parent we're ready — retry every 500ms until connected (max 6s)
            updateStatus('Connecting...');
            var readyAttempts = 0;
            var maxAttempts = 12;
            function sendReady() {
                if (PortalBridge.connected) { clearInterval(_readyInterval); return; }
                if (readyAttempts >= maxAttempts) {
                    clearInterval(_readyInterval);
                    updateStatus('Standalone Mode', '#f59e0b');
                    console.warn('PortalBridge: No parent response after ' + maxAttempts + ' attempts. Running in standalone mode.');
                    if (_onLoad && !_onLoadFired) { _onLoadFired = true; _onLoad(null, null); }
                    return;
                }
                readyAttempts++;
                sendToParent({ type: 'portal-ready' });
            }
            sendReady();
            _readyInterval = setInterval(sendReady, 500);
        },

        /**
         * Save current progress. Call after each answer or navigation.
         * Progress is preserved even after completion — it will never be wiped.
         * @param {Object} data - { state: {...}, currentQuestion: number }
         */
        save: function(data) {
            PortalBridge._lastState = data;
            if (!PortalBridge.connected) return;

            // Debounce saves (max once per second)
            clearTimeout(_saveTimeout);
            _saveTimeout = setTimeout(function() {
                updateStatus('Saving...');
                sendToParent({
                    type: 'portal-save',
                    payload: data
                });
            }, 500);
        },

        /**
         * Report a student answer. Call after each question submission.
         * The parent will award XP if correct and not already awarded.
         * @param {string} questionId - Unique question identifier
         * @param {boolean} correct - Whether the answer was correct
         * @param {number} attempts - Number of attempts on this question
         */
        reportAnswer: function(questionId, correct, attempts) {
            if (!PortalBridge.connected) return;
            sendToParent({
                type: 'portal-answer',
                payload: {
                    questionId: questionId,
                    correct: correct,
                    attempts: attempts || 1
                }
            });
        },

        /**
         * Mark the module as COMPLETED. Creates a permanent completion snapshot.
         * This should be called when the student finishes ALL questions or reaches
         * the end of the module. The completion record can never be deleted.
         *
         * Students can replay the module afterward without losing this record.
         *
         * @param {number} score - The student's score (e.g., percentage or points)
         * @param {number} totalQuestions - Total number of questions in the module
         * @param {number} correctAnswers - Number of questions answered correctly
         */
        complete: function(score, totalQuestions, correctAnswers) {
            if (!PortalBridge.connected) return;
            sendToParent({
                type: 'portal-complete',
                payload: {
                    score: score || 0,
                    totalQuestions: totalQuestions || 0,
                    correctAnswers: correctAnswers || 0
                }
            });
        },

        /**
         * Request a replay. Resets the active progress state so the student
         * can redo the module from the beginning. Completion records are PRESERVED.
         *
         * After the parent processes the reset, your onReset callback will fire.
         * Use that to reinitialize your HTML module's UI and state.
         */
        replay: function() {
            if (!PortalBridge.connected) return;
            sendToParent({ type: 'portal-replay' });
        },

        /**
         * Check if the module has been completed at least once.
         * @returns {boolean}
         */
        isCompleted: function() {
            return !!(PortalBridge.completionInfo && PortalBridge.completionInfo.completed);
        },

        /**
         * Get the number of times this module has been completed.
         * @returns {number}
         */
        getCompletionCount: function() {
            return (PortalBridge.completionInfo && PortalBridge.completionInfo.totalCompletions) || 0;
        },

        /**
         * Get the best score across all completions.
         * @returns {number}
         */
        getBestScore: function() {
            return (PortalBridge.completionInfo && PortalBridge.completionInfo.bestScore) || 0;
        },

        // Internal: last state for auto-save on unload
        _lastState: null
    };

    // Expose globally
    window.PortalBridge = PortalBridge;
})();
