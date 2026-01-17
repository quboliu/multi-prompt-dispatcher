// Settings page logic
(function () {
    'use strict';

    // DOM elements
    const reuseDashboardTabCheckbox = document.getElementById('reuseDashboardTab');
    const scanCurrentWindowOnlyCheckbox = document.getElementById('scanCurrentWindowOnly');
    const enableHistoryCheckbox = document.getElementById('enableHistory');
    const maxHistoryEntriesInput = document.getElementById('maxHistoryEntries');
    const exportHistoryBtn = document.getElementById('exportHistoryBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    const statusMessage = document.getElementById('statusMessage');

    // Default settings
    const DEFAULT_SETTINGS = {
        reuseDashboardTab: true,
        scanCurrentWindowOnly: false,
        enableHistory: true,
        maxHistoryEntries: 100
    };

    // Initialize
    init();

    async function init() {
        await loadSettings();
        setupEventListeners();
    }

    // Load settings from storage
    async function loadSettings() {
        try {
            const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
            reuseDashboardTabCheckbox.checked = result.reuseDashboardTab;
            scanCurrentWindowOnlyCheckbox.checked = result.scanCurrentWindowOnly;
            enableHistoryCheckbox.checked = result.enableHistory;
            maxHistoryEntriesInput.value = result.maxHistoryEntries;
        } catch (error) {
            console.error('[Settings] Failed to load settings:', error);
            showStatus('Failed to load settings', 'error');
        }
    }

    // Save settings to storage
    async function saveSettings() {
        const settings = {
            reuseDashboardTab: reuseDashboardTabCheckbox.checked,
            scanCurrentWindowOnly: scanCurrentWindowOnlyCheckbox.checked,
            enableHistory: enableHistoryCheckbox.checked,
            maxHistoryEntries: parseInt(maxHistoryEntriesInput.value)
        };

        try {
            await chrome.storage.sync.set(settings);
            showStatus('Settings saved successfully', 'success');
        } catch (error) {
            console.error('[Settings] Failed to save settings:', error);
            showStatus('Failed to save settings', 'error');
        }
    }

    // Reset to default settings
    async function resetSettings() {
        try {
            await chrome.storage.sync.set(DEFAULT_SETTINGS);
            await loadSettings();
            showStatus('Settings reset to defaults', 'success');
        } catch (error) {
            console.error('[Settings] Failed to reset settings:', error);
            showStatus('Failed to reset settings', 'error');
        }
    }

    // Export history as JSON
    async function exportHistory() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_PROMPT_HISTORY' });

            if (response && response.success) {
                const history = response.history || [];
                const json = JSON.stringify(history, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = `prompt-history-${new Date().toISOString().split('T')[0]}.json`;
                a.click();

                URL.revokeObjectURL(url);
                showStatus(`Exported ${history.length} entries`, 'success');
            } else {
                showStatus('No history to export', 'error');
            }
        } catch (error) {
            console.error('[Settings] Failed to export history:', error);
            showStatus('Failed to export history', 'error');
        }
    }

    // Clear history
    async function clearHistory() {
        if (!confirm('Are you sure you want to clear all prompt history? This cannot be undone.')) {
            return;
        }

        try {
            await chrome.runtime.sendMessage({ type: 'CLEAR_PROMPT_HISTORY' });
            showStatus('History cleared', 'success');
        } catch (error) {
            console.error('[Settings] Failed to clear history:', error);
            showStatus('Failed to clear history', 'error');
        }
    }

    // Show status message
    function showStatus(message, type = 'success') {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;

        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = 'status-message';
        }, 3000);
    }

    // Setup event listeners
    function setupEventListeners() {
        saveBtn.addEventListener('click', saveSettings);
        resetBtn.addEventListener('click', resetSettings);
        exportHistoryBtn.addEventListener('click', exportHistory);
        clearHistoryBtn.addEventListener('click', clearHistory);
    }

})();
