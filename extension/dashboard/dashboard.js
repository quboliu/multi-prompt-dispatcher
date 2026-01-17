/**
 * Dashboard Main Logic
 * Phase 2: Shadow Mirror Command Center
 */
(function () {
    'use strict';

    // DOM Elements
    const gridContainer = document.getElementById('gridContainer');
    const emptyState = document.getElementById('emptyState');
    const layoutSelect = document.getElementById('layoutSelect');
    const groupToggle = document.getElementById('groupToggle');
    const refreshBtn = document.getElementById('refreshBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const settingsBtn = document.getElementById('settingsBtn');

    // Sidebar Elements
    const appContainer = document.getElementById('app-container');
    const sidebarPosSelect = document.getElementById('sidebarPosSelect');
    const cardWidthInput = document.getElementById('cardWidthInput');
    const cardHeightInput = document.getElementById('cardHeightInput');
    const sidebarPromptInput = document.getElementById('sidebarPromptInput');
    const sidebarSendBtn = document.getElementById('sidebarSendBtn');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const historyList = document.getElementById('historyList');

    // State
    let activeTabs = [];
    let modelCards = new Map(); // tabId -> card element
    let responseData = new Map(); // tabId -> response object
    let promptHistory = []; // Array of { timestamp, text }

    // Initialization
    async function init() {
        setupEventListeners();
        loadSettings();
        loadHistory();
        updateLayout();
        await scanAndRefresh();
        setupMessageListener();
    }

    // Event Listeners
    function setupEventListeners() {
        layoutSelect.addEventListener('change', updateLayout);
        groupToggle.addEventListener('change', renderGrid);
        refreshBtn.addEventListener('click', scanAndRefresh);
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

        // Sidebar events
        sidebarPosSelect.addEventListener('change', (e) => setSidebarPosition(e.target.value));
        cardWidthInput.addEventListener('change', (e) => setCardDimensions(e.target.value, cardHeightInput.value));
        cardHeightInput.addEventListener('change', (e) => setCardDimensions(cardWidthInput.value, e.target.value));
        sidebarSendBtn.addEventListener('click', sendPromptToSelected);
        selectAllCheckbox.addEventListener('change', toggleSelectAll);
    }

    // --- Sidebar Logic ---

    function loadSettings() {
        // Position
        const savedPos = localStorage.getItem('sidebarPosition') || 'left';
        sidebarPosSelect.value = savedPos;
        setSidebarPosition(savedPos);

        // Dimensions
        const savedWidth = localStorage.getItem('cardWidth');
        const savedHeight = localStorage.getItem('cardHeight');

        if (savedWidth) cardWidthInput.value = parseInt(savedWidth);
        if (savedHeight) cardHeightInput.value = parseInt(savedHeight);

        setCardDimensions(savedWidth, savedHeight);
    }

    function setSidebarPosition(pos) {
        appContainer.className = `sidebar-${pos}`;
        localStorage.setItem('sidebarPosition', pos);
    }

    function setCardDimensions(width, height) {
        const root = document.documentElement;

        // Width logic
        if (width && width > 0) {
            root.style.setProperty('--card-width', `${width}px`);
            localStorage.setItem('cardWidth', width);
        } else {
            root.style.setProperty('--card-width', 'auto');
            localStorage.removeItem('cardWidth');
        }

        // Height logic
        if (height && height > 0) {
            root.style.setProperty('--card-height', `${height}px`);
            localStorage.setItem('cardHeight', height);
        } else {
            root.style.setProperty('--card-height', '50vh'); // Default to half screen
            localStorage.removeItem('cardHeight');
        }
    }

    function loadHistory() {
        const historyJson = localStorage.getItem('promptHistory');
        if (historyJson) {
            promptHistory = JSON.parse(historyJson);
            renderHistory();
        }
    }

    function saveHistory(text) {
        const newItem = {
            timestamp: new Date().toISOString(),
            text: text
        };
        promptHistory.unshift(newItem);
        // Limit history to 50 items
        if (promptHistory.length > 50) {
            promptHistory = promptHistory.slice(0, 50);
        }
        localStorage.setItem('promptHistory', JSON.stringify(promptHistory));
        renderHistory();
    }

    function renderHistory() {
        historyList.innerHTML = '';
        promptHistory.forEach(item => {
            const el = document.createElement('div');
            el.className = 'history-item';

            const timeDate = new Date(item.timestamp);
            const timeStr = timeDate.toLocaleTimeString() + ' ' + timeDate.toLocaleDateString();

            el.innerHTML = `
                <div class="history-time">${timeStr}</div>
                <div class="history-text">${escapeHtml(item.text)}</div>
            `;
            el.addEventListener('click', () => {
                sidebarPromptInput.value = item.text;
            });
            historyList.appendChild(el);
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- Core Logic ---

    async function scanAndRefresh() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'SCAN_TABS' });
            if (response && response.success) {
                activeTabs = response.tabs || [];
                renderGrid();
                startObservingAll();
            }
        } catch (error) {
            console.error('[Dashboard] Scan failed:', error);
        }
    }

    function renderGrid() {
        if (activeTabs.length === 0) {
            gridContainer.style.display = 'none';
            emptyState.classList.add('visible');
            return;
        }

        gridContainer.style.display = 'grid';
        emptyState.classList.remove('visible');

        gridContainer.innerHTML = '';
        modelCards.clear();

        const isGrouped = groupToggle.checked;

        if (isGrouped) {
            const groups = new Map();
            activeTabs.forEach(tab => {
                if (!groups.has(tab.displayName)) {
                    groups.set(tab.displayName, []);
                }
                groups.get(tab.displayName).push(tab);
            });

            groups.forEach((tabs, groupName) => {
                const header = document.createElement('div');
                header.className = 'group-header';
                header.textContent = `::: ${groupName} :::`;
                gridContainer.appendChild(header);

                tabs.forEach(tab => {
                    const card = createModelCard(tab);
                    gridContainer.appendChild(card);
                    modelCards.set(tab.tabId, card);
                    restoreCardData(tab.tabId, card);
                });
            });
        } else {
            activeTabs.forEach(tab => {
                const card = createModelCard(tab);
                gridContainer.appendChild(card);
                modelCards.set(tab.tabId, card);
                restoreCardData(tab.tabId, card);
            });
        }

        // Reset select all checkbox as cards are re-rendered and unchecked by default
        selectAllCheckbox.checked = false;
    }

    function createModelCard(tab) {
        const card = document.createElement('div');
        card.className = 'model-card';
        card.dataset.tabId = tab.tabId;

        card.innerHTML = `
            <div class="card-header">
                <div class="card-title-group">
                    <input type="checkbox" class="model-select" data-tab-id="${tab.tabId}">
                    <div class="title-container">
                        <span class="card-platform">${tab.displayName}</span>
                        <span class="card-page-title" title="${tab.title || ''}">${tab.title || ''}</span>
                    </div>
                </div>
                <div class="card-status">WAITING</div>
            </div>
            <div class="card-content">
                <div class="response-text">...</div>
            </div>
        `;

        // Handle checkbox click to prevent triggering card click
        const checkbox = card.querySelector('.model-select');
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Click card header (title area) to open tab
        const cardHeader = card.querySelector('.card-header');
        cardHeader.addEventListener('click', () => {
            chrome.tabs.update(tab.tabId, { active: true });
        });

        return card;
    }

    function restoreCardData(tabId, card) {
        const savedResponse = responseData.get(tabId);
        if (savedResponse) {
            updateCardUI(card, savedResponse);
        }
    }

    function updateCardUI(card, response) {
        if (!card || !response) return;
        const statusEl = card.querySelector('.card-status');
        const contentEl = card.querySelector('.response-text');

        if (response.isGenerating) {
            card.classList.add('generating');
            statusEl.textContent = 'BUSY';
        } else {
            card.classList.remove('generating');
            statusEl.textContent = 'DONE';
        }

        const newContent = response.content || '...';
        if (contentEl.textContent !== newContent) {
            contentEl.textContent = newContent;
            // Only auto-scroll if user is already near bottom or it's a new response start
            const cardContent = card.querySelector('.card-content');
            if (cardContent) {
                // Simple auto-scroll for now, can be improved
                cardContent.scrollTop = cardContent.scrollHeight;
            }
        }
    }

    async function startObservingAll() {
        for (const tab of activeTabs) {
            try {
                await chrome.runtime.sendMessage({
                    type: 'START_OBSERVING_TAB',
                    tabId: tab.tabId
                });
            } catch (error) {
                console.error(`[Dashboard] Failed to start observing tab ${tab.tabId}:`, error);
            }
        }
    }

    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'RESPONSE_UPDATE') {
                handleResponseUpdate(message.data);
                sendResponse({ received: true });
            }
            // Important: Do not call sendResponse for other messages (like SCAN_TABS)
            // to avoid intercepting messages intended for the background script.
        });
    }

    function handleResponseUpdate(data) {
        if (!data) return;
        const { tabId, response } = data;
        if (!response) return;

        const oldData = responseData.get(tabId);
        if (oldData && response.isGenerating && response.content.length < oldData.content.length * 0.8) {
            return;
        }
        if (oldData && oldData.content === response.content && oldData.isGenerating === response.isGenerating) {
            return;
        }

        responseData.set(tabId, response);
        const card = modelCards.get(tabId);
        updateCardUI(card, response);
    }

    function updateLayout() {
        const columns = layoutSelect.value;
        gridContainer.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    }

    async function sendPromptToSelected() {
        const prompt = sidebarPromptInput.value.trim();
        if (!prompt) {
            alert('Please enter a prompt.');
            return;
        }

        const checkboxes = document.querySelectorAll('.model-select:checked');
        const selectedTabIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.tabId));

        if (selectedTabIds.length === 0) {
            alert('Please select at least one model.');
            return;
        }

        try {
            await chrome.runtime.sendMessage({
                type: 'SEND_PROMPT_TO_TABS',
                tabIds: selectedTabIds,
                prompt: prompt
            });

            saveHistory(prompt);
            sidebarPromptInput.value = '';
        } catch (error) {
            console.error('[Dashboard] Send prompt failed:', error);
            alert('Send failed: ' + error.message);
        }
    }

    function toggleSelectAll() {
        const checkboxes = document.querySelectorAll('.model-select');
        const isChecked = selectAllCheckbox.checked;
        checkboxes.forEach(cb => cb.checked = isChecked);
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    init();
})();
