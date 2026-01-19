/**
 * Popup 主逻辑
 */
(function () {
    'use strict';

    // DOM 元素
    const targetsList = document.getElementById('targetsList');
    const noTargets = document.getElementById('noTargets');
    const promptInput = document.getElementById('promptInput');
    const charCount = document.getElementById('charCount');
    const sendBtn = document.getElementById('sendBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const resultsSection = document.getElementById('resultsSection');
    const resultsList = document.getElementById('resultsList');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const pinBtn = document.getElementById('pinBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const container = document.querySelector('.container');

    // 状态
    let availableTabs = [];
    let selectedTabIds = new Set();
    let newContentTabs = new Map(); // Track new content count per tab (tabId -> count)
    let tabReadyCache = new Map(); // Cache tab ready status (tabId -> { ready: boolean, timestamp: number })
    // Check if running in a popup (vs Side Panel or Tab)
    const isPopup = chrome.extension.getViews({ type: 'popup' }).includes(window);

    // 初始化
    async function init() {
        // 先加载全局状态
        await loadGlobalState();

        updatePinButton();
        await scanTabs();
        setupEventListeners();
        setupResponseListener();
        setupTabActivationListener();
        setupStateChangeListener(); // 监听全局状态变化
        setupVisibilityListener(); // 监听可见性变化，自动刷新

        // 暴露全局处理函数供 background 调用
        window.handleGlobalStateChange = handleStateChange;

        // If in side panel mode, start monitoring for dashboard
        if (!isPopup) {
            startDashboardMonitoring();
            // Removed: Auto-pinning on init caused zombie side panels. 
            // Only explicit user actions should set pinned=true.
        }
    }

    // 监听页面可见性变化 - 当页面变为可见时刷新状态
    function setupVisibilityListener() {
        // 页面获得焦点时刷新
        window.addEventListener('focus', async () => {
            console.log('[Popup] Window focused, refreshing state...');
            await loadGlobalState();
            await scanTabs(); // 也刷新标签页列表
        });

        // visibilitychange 事件
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible') {
                console.log('[Popup] Page became visible, refreshing state...');
                await loadGlobalState();
                await scanTabs();
            }
        });
    }

    // 加载全局状态
    async function loadGlobalState() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_GLOBAL_STATE' });
            if (response?.success && response.state) {
                // 恢复选中的标签页
                selectedTabIds = new Set(response.state.selectedTabIds || []);
                // 恢复新内容计数
                newContentTabs = new Map(Object.entries(response.state.newContentTabs || {}));
                // 恢复 prompt 输入
                if (response.state.promptInput) {
                    promptInput.value = response.state.promptInput;
                    updateCharCount();
                    updateSendButton();
                }
                console.log('[Popup] Global state loaded:', response.state);
            }
        } catch (error) {
            console.error('[Popup] Failed to load global state:', error);
        }
    }

    // 监听全局状态变化（来自其他 popup/dashboard 的更新）
    function setupStateChangeListener() {
        // 监听来自 background 的广播
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'STATE_CHANGED') {
                handleStateChange(event.data.state);
            }
        });

        // 也监听 chrome.runtime.onMessage
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'STATE_CHANGED') {
                handleStateChange(message.state);
            }
        });
    }

    // 处理状态变化
    function handleStateChange(newState) {
        if (!newState) return;

        let needsRender = false;

        // 更新选中的标签页
        if (newState.selectedTabIds) {
            const newSelected = new Set(newState.selectedTabIds);
            if (!setsEqual(selectedTabIds, newSelected)) {
                selectedTabIds = newSelected;
                needsRender = true;
            }
        }

        // 更新 prompt 输入
        if (newState.promptInput !== undefined && newState.promptInput !== promptInput.value) {
            promptInput.value = newState.promptInput;
            updateCharCount();
            updateSendButton();
        }

        // 更新新内容计数
        if (newState.newContentTabs) {
            newContentTabs = new Map(Object.entries(newState.newContentTabs));
            needsRender = true;
        }

        // 更新 pin 状态
        if (newState.sidePanelPinned !== undefined) {
            // 如果其他页面 unpin 了 side panel，这里也需要响应
            if (!newState.sidePanelPinned && !isPopup) {
                // Side panel 被其他页面关闭了
                window.close();
            }
        }

        if (needsRender) {
            renderTargets();
        }

        console.log('[Popup] State updated from broadcast');
    }

    // 辅助函数：比较两个 Set 是否相等
    function setsEqual(a, b) {
        if (a.size !== b.size) return false;
        for (const item of a) {
            if (!b.has(item)) return false;
        }
        return true;
    }

    // 设置事件监听
    function setupEventListeners() {
        refreshBtn.addEventListener('click', scanTabs);
        selectAllBtn.addEventListener('click', toggleSelectAll);
        sendBtn.addEventListener('click', sendToAll);
        promptInput.addEventListener('input', updateCharCount);
        promptInput.addEventListener('input', updateSendButton);
        promptInput.addEventListener('input', savePromptInput); // Auto-save on input
        pinBtn.addEventListener('click', handlePinAction);

        // 打开设置页面
        settingsBtn.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });

        // 打开 Dashboard（支持标签页复用）
        dashboardBtn.addEventListener('click', async () => {
            const settings = await chrome.storage.sync.get({ reuseDashboardTab: true });
            const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');

            if (settings.reuseDashboardTab) {
                // 查找已存在的 dashboard 标签页
                const tabs = await chrome.tabs.query({ url: dashboardUrl });
                if (tabs.length > 0) {
                    // 跳转到已存在的标签页
                    await chrome.tabs.update(tabs[0].id, { active: true });
                    await chrome.windows.update(tabs[0].windowId, { focused: true });
                    return;
                }
            }

            // 创建新标签页
            chrome.tabs.create({ url: dashboardUrl });
        });
    }

    // 更新 Pin 按钮状态
    function updatePinButton() {
        if (isPopup) {
            pinBtn.title = "Pin to Side Panel";
            pinBtn.querySelector('.pin-icon').textContent = "📌";
            pinBtn.classList.remove('active');
        } else {
            pinBtn.title = "Close Side Panel";
            pinBtn.querySelector('.pin-icon').textContent = "✕"; // Cleaner close icon
            pinBtn.classList.add('active');
        }
    }

    // 保存 Prompt 输入内容到全局状态
    function savePromptInput() {
        chrome.runtime.sendMessage({
            type: 'SET_GLOBAL_STATE',
            updates: { promptInput: promptInput.value }
        }).catch(error => {
            console.error('[Popup] Failed to save prompt input:', error);
        });
    }

    // 保存选中状态到全局
    function saveSelectedTabIds() {
        chrome.runtime.sendMessage({
            type: 'SET_GLOBAL_STATE',
            updates: { selectedTabIds: Array.from(selectedTabIds) }
        }).catch(error => {
            console.error('[Popup] Failed to save selected tabs:', error);
        });
    }

    // 保存新内容计数到全局
    function saveNewContentTabs() {
        chrome.runtime.sendMessage({
            type: 'SET_GLOBAL_STATE',
            updates: { newContentTabs: Object.fromEntries(newContentTabs) }
        }).catch(error => {
            console.error('[Popup] Failed to save new content tabs:', error);
        });
    }

    // 处理 Pin/Unpin 点击
    async function handlePinAction() {
        if (isPopup) {
            // Explicitly set pinned state to true
            await chrome.runtime.sendMessage({ type: 'SET_SIDEPANEL_PINNED', pinned: true });

            // 在 Side Panel 中打开
            const windowObj = await chrome.windows.getCurrent();
            await chrome.sidePanel.open({ windowId: windowObj.id });
            window.close(); // 关闭 Popup
        } else {
            // 用户手动关闭 Side Panel
            // 通知 background 强制关闭所有 Side Panel
            await chrome.runtime.sendMessage({
                type: 'CLOSE_ALL_SIDEPANELS'
            });

            // 关闭当前 Side Panel (虽然 background 会强制关闭，但这里先关为敬)
            window.close();
        }
    }

    // 扫描 LLM 标签页
    async function scanTabs() {
        showLoading();
        try {
            const currentWindow = await chrome.windows.getCurrent();
            const response = await chrome.runtime.sendMessage({
                type: 'SCAN_TABS',
                windowId: currentWindow.id
            });
            if (response && response.success) {
                availableTabs = response.tabs || [];
                renderTargets();
            } else {
                const errorMsg = (response && response.error) ? response.error : 'Unknown error';
                showError('扫描失败: ' + errorMsg);
            }
        } catch (error) {
            const errorMsg = (error && error.message) ? error.message : String(error);
            showError('扫描失败: ' + errorMsg);
        }
    }

    // 显示加载状态
    function showLoading() {
        targetsList.innerHTML = `
      <div class="loading">
        <span class="spinner"></span>
        <span>扫描中...</span>
      </div>
    `;
        noTargets.style.display = 'none';
    }

    // 显示错误
    function showError(message) {
        targetsList.innerHTML = `<div class="loading" style="color: #ff4b2b;">${message}</div>`;
    }

    // 检查标签页的 content script 是否就绪
    async function checkTabReady(tabId, useCache = true) {
        if (useCache) {
            const cached = tabReadyCache.get(tabId);
            // 缓存 5 秒内有效
            if (cached && Date.now() - cached.timestamp < 5000) {
                return cached.ready;
            }
        }

        // 实际检测
        try {
            const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
            const ready = response?.success === true;
            tabReadyCache.set(tabId, { ready, timestamp: Date.now() });
            return ready;
        } catch (error) {
            tabReadyCache.set(tabId, { ready: false, timestamp: Date.now() });
            return false;
        }
    }

    // 渲染目标列表
    async function renderTargets() {
        if (availableTabs.length === 0) {
            targetsList.innerHTML = '';
            noTargets.style.display = 'block';
            return;
        }

        noTargets.style.display = 'none';

        // Removed: selectedTabIds = new Set(availableTabs.map(t => t.tabId));
        // We want them unselected by default as per user request.

        // Update select all button text
        updateSelectAllButton();

        // Get current active tab
        let activeTabId = null;
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab) {
                activeTabId = activeTab.id;
            }
        } catch (error) {
            console.error('[Popup] Failed to get active tab:', error);
        }

        // Check ready status for all tabs in parallel
        const readyStatusPromises = availableTabs.map(tab => checkTabReady(tab.tabId));
        const readyStatuses = await Promise.all(readyStatusPromises);

        targetsList.innerHTML = availableTabs.map((tab, index) => {
            const newContentCount = newContentTabs.get(tab.tabId) || 0;
            const isActive = tab.tabId === activeTabId;
            const isSelected = selectedTabIds.has(tab.tabId);
            const isReady = readyStatuses[index];
            return `
      <div class="target-item ${isSelected ? 'selected' : ''} ${isActive ? 'active-tab' : ''}" data-tab-id="${tab.tabId}">
        <div class="target-checkbox"></div>
        <span class="target-icon">${tab.icon}</span>
        <div class="target-info" data-tab-id="${tab.tabId}">
          <div class="target-name">
            ${tab.displayName}
            ${newContentCount > 0 ? `<span class="new-content-badge">${newContentCount}</span>` : ''}
          </div>
          <div class="target-title">${tab.title || 'Loading...'}</div>
        </div>
        ${!isReady ? '<button class="refresh-tab-btn" data-tab-id="' + tab.tabId + '" title="刷新页面">⟳</button>' : ''}
      </div>
    `;
        }).join('');

        // 添加点击事件
        targetsList.querySelectorAll('.target-item').forEach(item => {
            const checkbox = item.querySelector('.target-checkbox');
            const targetInfo = item.querySelector('.target-info');
            const refreshBtn = item.querySelector('.refresh-tab-btn');
            const tabId = parseInt(item.dataset.tabId);

            // Checkbox area toggles selection
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTarget(item);
            });

            // Right-side area navigates to tab
            targetInfo.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateToTab(tabId);
            });

            // Refresh button refreshes the tab
            if (refreshBtn) {
                refreshBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    refreshTab(tabId);
                });
            }
        });

        updateSendButton();
    }

    // 切换目标选择
    function toggleTarget(item) {
        const tabId = parseInt(item.dataset.tabId);
        if (selectedTabIds.has(tabId)) {
            selectedTabIds.delete(tabId);
            item.classList.remove('selected');
        } else {
            selectedTabIds.add(tabId);
            item.classList.add('selected');
        }
        updateSendButton();
        updateSelectAllButton();
        saveSelectedTabIds(); // 同步到全局状态
    }

    // Toggle Select All / Deselect All
    function toggleSelectAll() {
        if (selectedTabIds.size === availableTabs.length && availableTabs.length > 0) {
            // All selected, so deselect all
            selectedTabIds.clear();
        } else {
            // Not all selected, so select all
            selectedTabIds = new Set(availableTabs.map(t => t.tabId));
        }
        saveSelectedTabIds(); // 同步到全局状态
        renderTargets();
    }

    // Update Select All button text
    function updateSelectAllButton() {
        if (!selectAllBtn) return;

        if (availableTabs.length === 0) {
            selectAllBtn.style.display = 'none';
            return;
        }

        selectAllBtn.style.display = 'block';
        if (selectedTabIds.size === availableTabs.length && availableTabs.length > 0) {
            selectAllBtn.textContent = '取消全选';
        } else {
            selectAllBtn.textContent = '全选';
        }
    }

    // 刷新指定标签页
    async function refreshTab(tabId) {
        try {
            // Clear cache for this tab
            tabReadyCache.delete(tabId);

            // Reload the tab
            await chrome.tabs.reload(tabId);

            // Wait a bit and re-render
            setTimeout(() => {
                renderTargets();
            }, 1000);
        } catch (error) {
            console.error('[Popup] Failed to refresh tab:', error);
        }
    }

    // 更新字符计数
    function updateCharCount() {
        charCount.textContent = promptInput.value.length;
    }

    // 更新发送按钮状态
    function updateSendButton() {
        const hasPrompt = promptInput.value.trim().length > 0;
        const hasTargets = selectedTabIds.size > 0;
        sendBtn.disabled = !hasPrompt || !hasTargets;

        const count = selectedTabIds.size;
        sendBtn.querySelector('.btn-text').textContent =
            count > 0 ? `发送到 ${count} 个模型` : '请选择目标模型';
    }

    // 发送到所有选中的模型
    async function sendToAll() {
        const prompt = promptInput.value.trim();
        if (!prompt || selectedTabIds.size === 0) return;

        // 检查所有选中的模型是否就绪
        const readyStatusPromises = Array.from(selectedTabIds).map(async (tabId) => ({
            tabId,
            ready: await checkTabReady(tabId, false) // 不使用缓存，实时检测
        }));

        const readyStatuses = await Promise.all(readyStatusPromises);
        const notReady = readyStatuses.filter(s => !s.ready);

        // 如果有未就绪的模型，阻止发送并提示
        if (notReady.length > 0) {
            const names = notReady.map(s => {
                const tab = availableTabs.find(t => t.tabId === s.tabId);
                return tab?.displayName || 'Unknown';
            }).join(', ');

            showError(`以下模型未就绪，请点击刷新按钮：${names}`);
            return;
        }

        sendBtn.classList.add('sending');
        sendBtn.disabled = true;

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'SEND_PROMPT_TO_TABS',
                tabIds: Array.from(selectedTabIds),
                prompt: prompt
            });

            if (response.success) {
                showResults(response.results);
            } else {
                showResults([{ success: false, error: response.error }]);
            }
        } catch (error) {
            showResults([{ success: false, error: error.message }]);
        } finally {
            sendBtn.classList.remove('sending');
            updateSendButton();
        }
    }

    // 显示发送结果
    function showResults(results) {
        resultsSection.style.display = 'block';

        resultsList.innerHTML = results.map(result => {
            const tab = availableTabs.find(t => t.tabId === result.tabId);
            const icon = tab?.icon || '🤖';
            const name = result.displayName || tab?.displayName || 'Unknown';

            return `
        <div class="result-item ${result.success ? 'success' : 'failed'}">
          <span class="result-icon">${icon}</span>
          <div class="result-info">
            <div class="result-name">${name}</div>
            <div class="result-status">
              ${result.success ? '✓ 发送成功' : '✗ ' + (result.error || '发送失败')}
            </div>
          </div>
        </div>
      `;
        }).join('');
    }

    // Navigate to tab and clear new content indicator
    async function navigateToTab(tabId) {
        // Clear new content indicator for this tab
        newContentTabs.delete(tabId);
        saveNewContentTabs(); // 同步到全局状态

        // Navigate to the tab
        try {
            await chrome.tabs.update(tabId, { active: true });
            // Wait a bit for the tab to actually become active
            setTimeout(() => {
                renderTargets(); // Re-render to update active state
            }, 100);
        } catch (error) {
            console.error('[Popup] Failed to navigate to tab:', error);
        }
    }

    // Setup response update listener
    function setupResponseListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'RESPONSE_UPDATE') {
                const data = message.data;
                if (data && data.tabId && data.response) {
                    // If response generation is complete, increment new content count
                    if (data.response.isGenerating === false) {
                        const currentCount = newContentTabs.get(data.tabId) || 0;
                        newContentTabs.set(data.tabId, currentCount + 1);
                        saveNewContentTabs(); // 同步到全局状态
                        renderTargets(); // Re-render to show indicator
                    }
                }
            }
        });
    }

    // Setup tab activation listener to update highlighting
    function setupTabActivationListener() {
        chrome.tabs.onActivated.addListener(() => {
            // Re-render when active tab changes
            renderTargets();
        });
    }


    // Dashboard 监控 - 当在 Side Panel 模式时自动关闭
    function startDashboardMonitoring() {
        // 获取 dashboard 的 URL
        const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');

        // 检查当前活动标签页是否是 dashboard
        async function checkAndUpdateVisibility() {
            try {
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (activeTab && activeTab.url) {
                    if (activeTab.url === dashboardUrl) {
                        // 在 dashboard 页面，通知 background 并关闭 side panel
                        const windowObj = await chrome.windows.getCurrent();

                        // 通知 background script 记录状态
                        await chrome.runtime.sendMessage({
                            type: 'SET_SIDEPANEL_STATE',
                            wasOpen: true,
                            windowId: windowObj.id
                        });

                        console.log('[Popup] Closing side panel, state saved for auto-reopen');

                        // 关闭 side panel
                        window.close();
                    }
                }
            } catch (error) {
                console.error('[Popup] Dashboard monitoring error:', error);
            }
        }

        // 初始检查
        checkAndUpdateVisibility();

        // 监听标签页激活事件
        chrome.tabs.onActivated.addListener(() => {
            checkAndUpdateVisibility();
        });

        // 监听标签页更新事件（URL 变化）
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.url) {
                checkAndUpdateVisibility();
            }
        });

        // 定期检查（作为备用，每秒检查一次）
        setInterval(checkAndUpdateVisibility, 1000);
    }


    // 启动
    init();
})();

