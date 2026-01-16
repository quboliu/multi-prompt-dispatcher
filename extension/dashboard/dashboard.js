/**
 * Dashboard 主逻辑
 * Phase 2: 影子镜像指挥中心
 */
(function () {
    'use strict';

    // DOM 元素
    const gridContainer = document.getElementById('gridContainer');
    const emptyState = document.getElementById('emptyState');
    const layoutSelect = document.getElementById('layoutSelect');
    const refreshBtn = document.getElementById('refreshBtn');
    const showPromptBtn = document.getElementById('showPromptBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const promptPanel = document.getElementById('promptPanel');
    const promptInput = document.getElementById('promptInput');
    const sendPromptBtn = document.getElementById('sendPromptBtn');
    const closePromptBtn = document.getElementById('closePromptBtn');

    // 状态
    let activeTabs = [];
    let modelCards = new Map(); // tabId -> card element
    let responseData = new Map(); // tabId -> response object

    // 初始化
    async function init() {
        setupEventListeners();
        await scanAndRefresh();
        setupMessageListener();
    }

    // 事件监听
    function setupEventListeners() {
        layoutSelect.addEventListener('change', updateLayout);
        refreshBtn.addEventListener('click', scanAndRefresh);
        showPromptBtn.addEventListener('click', () => promptPanel.classList.remove('hidden'));
        closePromptBtn.addEventListener('click', () => promptPanel.classList.add('hidden'));
        sendPromptBtn.addEventListener('click', sendPromptToAll);
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    // 扫描并刷新
    async function scanAndRefresh() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'SCAN_TABS' });
            if (response.success) {
                activeTabs = response.tabs;
                renderGrid();
                startObservingAll();
                // 不再使用轮询，改用网络拦截推送
                // startPolling();
            }
        } catch (error) {
            console.error('[Dashboard] Scan failed:', error);
        }
    }

    // 渲染 Grid
    function renderGrid() {
        if (activeTabs.length === 0) {
            gridContainer.style.display = 'none';
            emptyState.classList.add('visible');
            return;
        }

        gridContainer.style.display = 'grid';
        emptyState.classList.remove('visible');

        // 清空现有卡片
        gridContainer.innerHTML = '';
        modelCards.clear();

        // 创建卡片
        activeTabs.forEach(tab => {
            const card = createModelCard(tab);
            gridContainer.appendChild(card);
            modelCards.set(tab.tabId, card);
        });
    }

    // 创建模型卡片
    function createModelCard(tab) {
        const card = document.createElement('div');
        card.className = 'model-card';
        card.dataset.tabId = tab.tabId;

        card.innerHTML = `
      <div class="card-header">
        <div class="card-title">
          <span class="model-icon">${tab.icon}</span>
          <span>${tab.displayName}</span>
        </div>
        <div class="card-status">等待中...</div>
      </div>
      <div class="card-content">
        <div class="response-text">暂无输出</div>
      </div>
    `;

        // 点击跳转到原标签页
        card.addEventListener('click', () => {
            chrome.tabs.update(tab.tabId, { active: true });
        });

        return card;
    }

    // 启动所有标签页的监听
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

    // ============ 主动轮询机制 ============
    let pollingIntervalId = null;

    // 启动主动轮询
    function startPolling() {
        // 停止之前的轮询
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
        }

        // 每 100ms 轮询一次
        pollingIntervalId = setInterval(pollLatestResponses, 100);
        console.log('[Dashboard] Started polling');
    }

    // 轮询获取最新响应 - 使用 chrome.scripting.executeScript 直接获取
    async function pollLatestResponses() {
        for (const tab of activeTabs) {
            try {
                // 直接在目标页面的 MAIN 世界执行脚本获取数据
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.tabId },
                    world: 'MAIN',  // 关键！在 MAIN 世界执行才能访问 window.currentAdapter
                    func: () => {
                        // 这个函数在目标页面的 MAIN 世界执行
                        if (window.currentAdapter && typeof window.currentAdapter.extractLatestResponse === 'function') {
                            return window.currentAdapter.extractLatestResponse();
                        }
                        return null;
                    }
                });

                if (results && results[0] && results[0].result) {
                    handleResponseUpdate({
                        tabId: tab.tabId,
                        response: results[0].result
                    });
                }
            } catch (error) {
                // 忽略错误（可能是权限问题或页面未加载完成）
                console.log('[Dashboard] Poll error for tab', tab.tabId, error.message);
            }
        }
    }

    // 停止轮询（页面关闭时）
    window.addEventListener('beforeunload', () => {
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
        }
    });

    // 监听来自 Background 的广播
    function setupMessageListener() {
        // 使用 chrome.runtime.onMessage 接收消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('[Dashboard] Received message:', message.type);

            if (message.type === 'RESPONSE_UPDATE') {
                handleResponseUpdate(message.data);
            }

            sendResponse({ received: true });
        });
    }

    // 处理响应更新 - 直接同步更新，确保实时性
    function handleResponseUpdate(data) {
        const { tabId, response } = data;

        if (!response) return;

        // 检查内容是否真正变化
        const oldData = responseData.get(tabId);
        if (oldData && oldData.content === response.content && oldData.isGenerating === response.isGenerating) {
            return; // 内容没变，不更新
        }

        // 更新数据
        responseData.set(tabId, response);

        // 直接更新 UI
        const card = modelCards.get(tabId);
        if (!card) return;

        const statusEl = card.querySelector('.card-status');
        const contentEl = card.querySelector('.response-text');

        if (response.isGenerating) {
            card.classList.add('generating');
            statusEl.textContent = '生成中...';
            statusEl.classList.add('status-generating');
        } else {
            card.classList.remove('generating');
            statusEl.textContent = '已完成';
            statusEl.classList.remove('status-generating');
        }

        // 只在内容变化时更新
        const newContent = response.content || '(空)';
        if (contentEl.textContent !== newContent) {
            contentEl.textContent = newContent;
        }

        // 自动滚动到底部
        const cardContent = card.querySelector('.card-content');
        if (cardContent) {
            cardContent.scrollTop = cardContent.scrollHeight;
        }
    }

    // 更新布局
    function updateLayout() {
        const layout = layoutSelect.value;
        gridContainer.className = `grid-container grid-${layout}`;
    }

    // 发送 Prompt 到所有模型
    async function sendPromptToAll() {
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        const tabIds = activeTabs.map(t => t.tabId);

        try {
            await chrome.runtime.sendMessage({
                type: 'SEND_PROMPT_TO_TABS',
                tabIds: tabIds,
                prompt: prompt
            });

            promptPanel.classList.add('hidden');
            promptInput.value = '';
        } catch (error) {
            console.error('[Dashboard] Send prompt failed:', error);
            alert('发送失败: ' + error.message);
        }
    }

    // 全屏切换
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            fullscreenBtn.querySelector('span').textContent = '⛶';
        } else {
            document.exitFullscreen();
            fullscreenBtn.querySelector('span').textContent = '⛶';
        }
    }

    // 启动
    init();
})();
