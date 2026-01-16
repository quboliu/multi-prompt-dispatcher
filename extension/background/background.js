/**
 * Background Service Worker
 * 负责管理标签页状态，协调消息传递
 */

// 支持的平台 URL 模式
const SUPPORTED_PATTERNS = [
    { pattern: /^https:\/\/(chat\.openai\.com|chatgpt\.com)/, name: 'chatgpt', displayName: 'ChatGPT', icon: '💚' },
    { pattern: /^https:\/\/claude\.ai/, name: 'claude', displayName: 'Claude', icon: '🧡' },
    { pattern: /^https:\/\/(gemini\.google\.com|aistudio\.google\.com)/, name: 'gemini', displayName: 'Gemini', icon: '💙' }
];

// 存储活跃的 LLM 标签页状态
const tabStates = new Map();

// Phase 2: 缓存各标签页的最新响应（避免后台标签页延迟问题）
const responseCache = new Map(); // tabId -> { response, timestamp }

/**
 * 检查 URL 是否匹配支持的平台
 * @param {string} url 
 * @returns {object|null}
 */
function matchPlatform(url) {
    for (const platform of SUPPORTED_PATTERNS) {
        if (platform.pattern.test(url)) {
            return platform;
        }
    }
    return null;
}

/**
 * 扫描所有标签页，找出 LLM 平台
 * @returns {Promise<Array>}
 */
async function scanTabs() {
    const tabs = await chrome.tabs.query({});
    const llmTabs = [];

    for (const tab of tabs) {
        if (!tab.url) continue;

        const platform = matchPlatform(tab.url);
        if (platform) {
            // 尝试获取 content script 状态
            let status = null;
            try {
                status = await sendMessageToTab(tab.id, { type: 'GET_STATUS' });
            } catch (e) {
                // Content script 可能未加载
                status = null;
            }

            llmTabs.push({
                tabId: tab.id,
                title: tab.title,
                url: tab.url,
                platform: platform.name,
                displayName: platform.displayName,
                icon: platform.icon,
                ready: status?.data?.ready || false,
                status: status?.data || null
            });
        }
    }

    return llmTabs;
}

/**
 * 向指定标签页发送消息
 * @param {number} tabId 
 * @param {object} message 
 * @returns {Promise<object>}
 */
function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * 向多个标签页并行发送 prompt
 * @param {Array<number>} tabIds 
 * @param {string} prompt 
 * @returns {Promise<Array>}
 */
async function sendPromptToTabs(tabIds, prompt) {
    const results = await Promise.allSettled(
        tabIds.map(async (tabId) => {
            try {
                const response = await sendMessageToTab(tabId, {
                    type: 'SEND_PROMPT',
                    prompt: prompt
                });
                return {
                    tabId,
                    ...response
                };
            } catch (error) {
                return {
                    tabId,
                    success: false,
                    error: error.message
                };
            }
        })
    );

    return results.map(result => {
        if (result.status === 'fulfilled') {
            return result.value;
        } else {
            return {
                tabId: null,
                success: false,
                error: result.reason?.message || 'Unknown error'
            };
        }
    });
}

/**
 * 处理来自 Popup 的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] Received message:', message);

    switch (message.type) {
        case 'SCAN_TABS':
            // 扫描所有 LLM 标签页
            scanTabs()
                .then(tabs => {
                    sendResponse({ success: true, tabs });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case 'SEND_PROMPT_TO_TABS':
            // 向指定标签页发送 prompt
            sendPromptToTabs(message.tabIds, message.prompt)
                .then(results => {
                    sendResponse({ success: true, results });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case 'CONTENT_READY':
            // Content Script 报告就绪
            if (sender.tab) {
                tabStates.set(sender.tab.id, {
                    ...message.data,
                    tabId: sender.tab.id,
                    lastUpdate: Date.now()
                });
            }
            sendResponse({ success: true });
            break;

        case 'RESPONSE_UPDATE':
            // Phase 2: Content Script 广播响应更新
            if (sender.tab) {
                const tabId = sender.tab.id;
                const data = {
                    ...message.data,
                    tabId: tabId
                };

                // 缓存响应数据（关键！）
                responseCache.set(tabId, {
                    response: message.data.response,
                    platform: message.data.platform,
                    displayName: message.data.displayName,
                    icon: message.data.icon,
                    timestamp: Date.now()
                });

                // 广播给所有 Dashboard 页面
                broadcastToDashboards('RESPONSE_UPDATE', data);
            }
            sendResponse({ success: true });
            break;

        case 'START_OBSERVING_TAB':
            // Phase 2: Dashboard 请求启动某个 Tab 的监听
            if (message.tabId) {
                sendMessageToTab(message.tabId, { type: 'START_OBSERVING' })
                    .then(() => sendResponse({ success: true }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
            }
            break;

        case 'STOP_OBSERVING_TAB':
            // Phase 2: Dashboard 请求停止某个 Tab 的监听
            if (message.tabId) {
                sendMessageToTab(message.tabId, { type: 'STOP_OBSERVING' })
                    .then(() => sendResponse({ success: true }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
            }
            break;

        case 'GET_LATEST_RESPONSE_FROM_TAB':
            // Phase 2: Dashboard 主动拉取最新响应（从缓存返回，不需要问后台标签页）
            if (message.tabId) {
                const cached = responseCache.get(message.tabId);
                if (cached) {
                    sendResponse({ success: true, response: cached.response });
                } else {
                    sendResponse({ success: false, error: 'No cached response' });
                }
            } else {
                sendResponse({ success: false, error: 'No tabId' });
            }
            break;

        default:
            sendResponse({ success: false, error: 'Unknown message type' });
    }
});

/**
 * Phase 2: 广播消息到所有 Dashboard 页面
 * @param {string} type 
 * @param {object} data 
 */
async function broadcastToDashboards(type, data) {
    try {
        // 获取所有扩展页面（Manifest V3 方式）
        const extensionUrl = chrome.runtime.getURL('dashboard/dashboard.html');
        const tabs = await chrome.tabs.query({ url: extensionUrl });

        for (const tab of tabs) {
            // 使用 chrome.tabs.sendMessage 发送消息
            chrome.tabs.sendMessage(tab.id, { type, data }).catch(() => {
                // 忽略错误（页面可能正在加载）
            });
        }

        console.log(`[Background] Broadcast ${type} to ${tabs.length} dashboard(s)`);
    } catch (error) {
        console.error('[Background] Error broadcasting to dashboards:', error);
    }
}


/**
 * 监听标签页关闭事件，清理状态
 */
chrome.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
});

/**
 * 监听标签页 URL 更新
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        const platform = matchPlatform(changeInfo.url);
        if (!platform) {
            tabStates.delete(tabId);
        }
    }
});

console.log('[Background] Service worker initialized');

/**
 * Phase 2: 监听快捷键命令
 */
chrome.commands.onCommand.addListener((command) => {
    if (command === 'open-dashboard') {
        // 打开 Dashboard 页面
        chrome.tabs.create({
            url: chrome.runtime.getURL('dashboard/dashboard.html')
        });
    }
});
