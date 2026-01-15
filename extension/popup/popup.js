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

    // 状态
    let availableTabs = [];
    let selectedTabIds = new Set();

    // 初始化
    async function init() {
        await scanTabs();
        setupEventListeners();
    }

    // 设置事件监听
    function setupEventListeners() {
        refreshBtn.addEventListener('click', scanTabs);
        sendBtn.addEventListener('click', sendToAll);
        promptInput.addEventListener('input', updateCharCount);
        promptInput.addEventListener('input', updateSendButton);
    }

    // 扫描 LLM 标签页
    async function scanTabs() {
        showLoading();
        try {
            const response = await chrome.runtime.sendMessage({ type: 'SCAN_TABS' });
            if (response.success) {
                availableTabs = response.tabs;
                renderTargets();
            } else {
                showError('扫描失败: ' + response.error);
            }
        } catch (error) {
            showError('扫描失败: ' + error.message);
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
    function renderTargets() {
        if (availableTabs.length === 0) {
            targetsList.innerHTML = '';
            noTargets.style.display = 'block';
            return;
        }

        noTargets.style.display = 'none';
        selectedTabIds = new Set(availableTabs.map(t => t.tabId));

        targetsList.innerHTML = availableTabs.map(tab => `
      <div class="target-item selected" data-tab-id="${tab.tabId}">
        <div class="target-checkbox"></div>
        <span class="target-icon">${tab.icon}</span>
        <div class="target-info">
          <div class="target-name">
            ${tab.displayName}
            <span class="status-dot ${tab.ready ? '' : 'not-ready'}"></span>
          </div>
          <div class="target-title">${tab.title || 'Loading...'}</div>
        </div>
      </div>
    `).join('');

        // 添加点击事件
        targetsList.querySelectorAll('.target-item').forEach(item => {
            item.addEventListener('click', () => toggleTarget(item));
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

    // 启动
    init();
})();
