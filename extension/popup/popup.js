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
    const container = document.querySelector('.container');

    // 状态
    let availableTabs = [];
    let selectedTabIds = new Set();
    let newContentTabs = new Map(); // Track new content count per tab (tabId -> count)
    // Check if running in a popup (vs Side Panel or Tab)
    const isPopup = chrome.extension.getViews({ type: 'popup' }).includes(window);

    // 初始化
    async function init() {
        updatePinButton();
        restorePromptInput(); // Restore saved prompt
        await scanTabs();
        setupEventListeners();
        setupResponseListener();
        setupTabActivationListener(); // Listen for tab switches

        // If in side panel mode, start monitoring for dashboard
        if (!isPopup) {
            startDashboardMonitoring();
        }
    }

    // 设置事件监听
    function setupEventListeners() {
        refreshBtn.addEventListener('click', scanTabs);
        sendBtn.addEventListener('click', sendToAll);
        promptInput.addEventListener('input', updateCharCount);
        promptInput.addEventListener('input', updateSendButton);
        promptInput.addEventListener('input', savePromptInput); // Auto-save on input
        pinBtn.addEventListener('click', handlePinAction);

        // 打开 Dashboard
        dashboardBtn.addEventListener('click', () => {
            chrome.tabs.create({
                url: chrome.runtime.getURL('dashboard/dashboard.html')
            });
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

    // 保存 Prompt 输入内容
    function savePromptInput() {
        try {
            localStorage.setItem('popup_prompt_input', promptInput.value);
        } catch (error) {
            console.error('[Popup] Failed to save prompt input:', error);
        }
    }

    // 恢复 Prompt 输入内容
    function restorePromptInput() {
        try {
            const savedPrompt = localStorage.getItem('popup_prompt_input');
            if (savedPrompt) {
                promptInput.value = savedPrompt;
                updateCharCount();
                updateSendButton();
            }
        } catch (error) {
            console.error('[Popup] Failed to restore prompt input:', error);
        }
    }

    // 处理 Pin/Unpin 点击
    async function handlePinAction() {
        if (isPopup) {
            // 在 Side Panel 中打开
            const windowObj = await chrome.windows.getCurrent();
            await chrome.sidePanel.open({ windowId: windowObj.id });
            window.close(); // 关闭 Popup
        } else {
            // 用户手动关闭 Side Panel
            // 通知 background 清除自动重新打开的状态
            await chrome.runtime.sendMessage({
                type: 'CLEAR_SIDEPANEL_STATE'
            });

            // 关闭 Side Panel
            window.close();
        }
    }

    // 扫描 LLM 标签页
    async function scanTabs() {
        showLoading();
        try {
            const response = await chrome.runtime.sendMessage({ type: 'SCAN_TABS' });
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

    // 渲染目标列表
    async function renderTargets() {
        if (availableTabs.length === 0) {
            targetsList.innerHTML = '';
            noTargets.style.display = 'block';
            return;
        }

        noTargets.style.display = 'none';
        selectedTabIds = new Set(availableTabs.map(t => t.tabId));

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

        targetsList.innerHTML = availableTabs.map(tab => {
            const newContentCount = newContentTabs.get(tab.tabId) || 0;
            const isActive = tab.tabId === activeTabId;
            return `
      <div class="target-item selected ${isActive ? 'active-tab' : ''}" data-tab-id="${tab.tabId}">
        <div class="target-checkbox"></div>
        <span class="target-icon">${tab.icon}</span>
        <div class="target-info" data-tab-id="${tab.tabId}">
          <div class="target-name">
            ${tab.displayName}
            ${newContentCount > 0 ? `<span class="new-content-badge">${newContentCount}</span>` : ''}
          </div>
          <div class="target-title">${tab.title || 'Loading...'}</div>
        </div>
      </div>
    `;
        }).join('');

        // 添加点击事件
        targetsList.querySelectorAll('.target-item').forEach(item => {
            const checkbox = item.querySelector('.target-checkbox');
            const targetInfo = item.querySelector('.target-info');
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

