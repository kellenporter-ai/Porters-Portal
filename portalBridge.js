// ============================================================
// PORTER'S PORTAL — Practice Set Bridge (portalBridge.js)
// ============================================================
//
// DROP-IN REPLACEMENT for Firebase in HTML practice sets.
//
// Instead of including Firebase SDK + your own save logic, include this
// single script. It communicates with the Porter's Portal parent app
// via postMessage to handle saving, loading, and XP awards.
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
//            onLoad: (savedState) => {
//                // Restore your state from savedState (or start fresh if null)
//                if (savedState) {
//                    state = savedState.state || state;
//                    curIdx = savedState.currentQuestion || 0;
//                    renderSidebar();
//                    loadQ(curIdx);
//                }
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
//    // Save status element (optional):
//    // PortalBridge will auto-update an element with id="save-status"
// ─────────────────────────────────────────────────────────────

(function() {
    'use strict';

    var ALLOWED_ORIGIN = 'https://porters-portal.web.app';
    var saveStatusEl = null;
    var _onLoad = null;
    var _saveTimeout = null;

    function updateStatus(text, color) {
        if (!saveStatusEl) saveStatusEl = document.getElementById('save-status');
        if (saveStatusEl) {
            saveStatusEl.innerText = text;
            saveStatusEl.style.color = color || '#888';
        }
    }

    var PortalBridge = {
        connected: false,
        userId: null,

        /**
         * Initialize the bridge. Call this on window.onload.
         * @param {Object} opts
         * @param {Function} opts.onLoad - Called with (savedState) when parent sends saved data.
         *                                 savedState is null if no saved progress exists.
         */
        init: function(opts) {
            opts = opts || {};
            _onLoad = opts.onLoad || null;

            // Listen for messages from parent (validate origin)
            window.addEventListener('message', function(event) {
                if (event.origin !== ALLOWED_ORIGIN) return;
                var data = event.data;
                if (!data || typeof data !== 'object') return;

                switch(data.type) {
                    case 'portal-init':
                        PortalBridge.connected = true;
                        PortalBridge.userId = data.payload.userId;
                        updateStatus('Connected', '#4ade80');
                        if (_onLoad) {
                            _onLoad(data.payload.savedState);
                        }
                        break;

                    case 'portal-save-ok':
                        updateStatus('Saved', '#4ade80');
                        setTimeout(function() { updateStatus('', '#888'); }, 2000);
                        break;

                    case 'portal-save-error':
                        updateStatus('Save Failed', '#ef4444');
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

            // Tell parent we're ready
            updateStatus('Connecting...');
            window.parent.postMessage({ type: 'portal-ready' }, ALLOWED_ORIGIN);

            // If parent doesn't respond in 3 seconds, fall back to standalone mode
            setTimeout(function() {
                if (!PortalBridge.connected) {
                    updateStatus('Standalone Mode', '#f59e0b');
                    console.warn('PortalBridge: No parent response. Running in standalone mode.');
                    if (_onLoad) _onLoad(null);
                }
            }, 3000);
        },

        /**
         * Save current progress. Call after each answer or navigation.
         * @param {Object} data - { state: {...}, currentQuestion: number }
         */
        save: function(data) {
            PortalBridge._lastState = data;
            if (!PortalBridge.connected) return;
            
            // Debounce saves (max once per second)
            clearTimeout(_saveTimeout);
            _saveTimeout = setTimeout(function() {
                updateStatus('Saving...');
                window.parent.postMessage({
                    type: 'portal-save',
                    payload: data
                }, ALLOWED_ORIGIN);
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
            window.parent.postMessage({
                type: 'portal-answer',
                payload: {
                    questionId: questionId,
                    correct: correct,
                    attempts: attempts || 1
                }
            }, ALLOWED_ORIGIN);
        },

        // Internal: last state for auto-save on unload
        _lastState: null
    };

    // Expose globally
    window.PortalBridge = PortalBridge;
})();
