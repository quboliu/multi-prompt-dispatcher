/**
 * Background Service Worker
 * 负责管理标签页状态，协调消息传递
 */

// 支持的平台 URL 模式
const SUPPORTED_PATTERNS = [
    // 国际平台
    { pattern: /^https:\/\/(chat\.openai\.com|chatgpt\.com)/, name: 'chatgpt', displayName: 'ChatGPT', icon: '💚' },
    { pattern: /^https:\/\/claude\.ai/, name: 'claude', displayName: 'Claude', icon: '🧡' },
    { pattern: /^https:\/\/gemini\.google\.com/, name: 'gemini', displayName: 'Gemini', icon: '💙' },
    { pattern: /^https:\/\/aistudio\.google\.com/, name: 'aistudio', displayName: 'Google AI Studio', icon: '🛠️' },
    { pattern: /^https:\/\/(grok\.com|grok\.x\.ai|x\.com)/, name: 'grok', displayName: 'Grok', icon: '🖤' },

    // 国内平台
    { pattern: /^https:\/\/chat\.deepseek\.com/, name: 'deepseek', displayName: 'DeepSeek', icon: '🔵' },
    { pattern: /^https:\/\/(tongyi\.aliyun\.com|qianwen\.aliyun\.com|chat\.qwen\.ai)/, name: 'qwen', displayName: '通义千问', icon: '💜' },
    { pattern: /^https:\/\/(www\.)?doubao\.com/, name: 'doubao', displayName: '豆包', icon: '🟠' },
    { pattern: /^https:\/\/(chatglm\.cn|zhipuai\.cn)/, name: 'glm', displayName: '智谱清言', icon: '🟢' },
    { pattern: /^https:\/\/hailuoai\.com/, name: 'minimax', displayName: 'MiniMax', icon: '🐚' },
    { pattern: /^https:\/\/kimi\.moonshot\.cn/, name: 'kimi', displayName: 'Kimi', icon: '🌙' }
];

// 存储活跃的 LLM 标签页状态
const tabStates = new Map();

// Phase 2: 缓存各标签页的最新响应（避免后台标签页延迟问题）
const responseCache = new Map(); // tabId -> { response, timestamp }

// Side Panel 状态跟踪（方案A：内存状态）
let sidePanelState = {
    wasOpenBeforeDashboard: false,  // 在打开 dashboard 前是否打开了 side panel
    lastWindowId: null                // 记录最后操作的窗口 ID
};

// Prompt history tracking
let promptHistory = []; // Array of { timestamp, prompt, targets: [{ tabId, displayName }] }


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
 * @param {object} filterOptions 过滤选项
 * @returns {Promise<Array>}
 */
async function scanTabs(filterOptions = {}) {
    const queryOptions = {};
    if (filterOptions.windowId) {
        queryOptions.windowId = filterOptions.windowId;
    }
    const tabs = await chrome.tabs.query(queryOptions);
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
 * 向指定标签页发送消息 (带超时)
 * @param {number} tabId 
 * @param {object} message 
 * @param {number} timeout 
 * @returns {Promise<object>}
 */
function sendMessageToTab(tabId, message, timeout = 5000) {
    return new Promise((resolve, reject) => {
        let isTimedOut = false;

        const timer = setTimeout(() => {
            isTimedOut = true;
            reject(new Error('Request timed out'));
        }, timeout);

        chrome.tabs.sendMessage(tabId, message, (response) => {
            clearTimeout(timer);
            if (isTimedOut) return;

            if (chrome.runtime.lastError) {
                // 忽略 "Could not establish connection" 错误，这意味着 content script 还没加载好
                // 但仍然要 reject 以便调用者知道失败了
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
            (async () => {
                const settings = await chrome.storage.sync.get({ scanCurrentWindowOnly: false });
                const filterOptions = {};

                if (settings.scanCurrentWindowOnly) {
                    // 如果开启了只检测当前窗口，且消息中带了 windowId，则使用它
                    if (message.windowId) {
                        filterOptions.windowId = message.windowId;
                    } else if (sender.tab) {
                        // 如果是从标签页（如 Dashboard）发来的，使用该标签页的 windowId
                        filterOptions.windowId = sender.tab.windowId;
                    }
                }

                try {
                    const tabs = await scanTabs(filterOptions);
                    sendResponse({ success: true, tabs });
                } catch (error) {
                    const msg = (error && error.message) ? error.message : String(error);
                    sendResponse({ success: false, error: msg });
                }
            })();
            return true;

        case 'SEND_PROMPT_TO_TABS':
            // 向指定标签页发送 prompt
            sendPromptToTabs(message.tabIds, message.prompt)
                .then(async (results) => {
                    // Track history if enabled
                    const settings = await chrome.storage.sync.get({ enableHistory: true, maxHistoryEntries: 100 });
                    if (settings.enableHistory) {
                        const targets = message.tabIds.map(tabId => {
                            const state = tabStates.get(tabId);
                            return {
                                tabId,
                                displayName: state?.displayName || 'Unknown'
                            };
                        });

                        promptHistory.unshift({
                            timestamp: new Date().toISOString(),
                            prompt: message.prompt,
                            targets
                        });

                        // Trim history to max entries
                        if (promptHistory.length > settings.maxHistoryEntries) {
                            promptHistory = promptHistory.slice(0, settings.maxHistoryEntries);
                        }
                    }

                    sendResponse({ success: true, results });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case 'GET_PROMPT_HISTORY':
            // Get prompt history for export
            sendResponse({ success: true, history: promptHistory });
            return true;

        case 'CLEAR_PROMPT_HISTORY':
            // Clear prompt history
            promptHistory = [];
            sendResponse({ success: true });
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

                // 广播给所有 Popup/Side Panel 页面
                broadcastToPopups('RESPONSE_UPDATE', data);
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

        case 'SET_SIDEPANEL_STATE':
            // Popup 通知 background 即将关闭 side panel
            if (message.wasOpen !== undefined) {
                sidePanelState.wasOpenBeforeDashboard = message.wasOpen;
                sidePanelState.lastWindowId = message.windowId;
                console.log('[Background] Side panel state updated:', sidePanelState);
            }
            sendResponse({ success: true });
            break;

        case 'CLEAR_SIDEPANEL_STATE':
            // 用户手动关闭 side panel 时清除状态
            sidePanelState.wasOpenBeforeDashboard = false;
            sidePanelState.lastWindowId = null;
            console.log('[Background] Side panel state cleared');
            sendResponse({ success: true });
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

        console.log(`[Background] Broadcast ${type} to ${tabs.length} dashboard(s):`, tabs.map(t => t.id));
    } catch (error) {
        console.error('[Background] Error broadcasting to dashboards:', error);
    }
}

/**
 * 广播消息到所有 Popup/Side Panel 页面
 * @param {string} type 
 * @param {object} data 
 */
async function broadcastToPopups(type, data) {
    try {
        // 获取所有 popup 和 side panel 视图
        const views = chrome.extension.getViews({ type: 'popup' });

        for (const view of views) {
            try {
                // 直接调用 window 的 postMessage 或使用 runtime.sendMessage
                if (view.chrome && view.chrome.runtime) {
                    view.chrome.runtime.sendMessage({ type, data }).catch(() => {
                        // 忽略错误
                    });
                }
            } catch (error) {
                // 忽略单个视图的错误
            }
        }

        console.log(`[Background] Broadcast ${type} to ${views.length} popup(s)`);
    } catch (error) {
        console.error('[Background] Error broadcasting to popups:', error);
    }
}

/**
 * 监听标签页关闭事件，清理状态
 */
chrome.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
});

// 恢复全局默认为启用，确保 Pin 按钮功能正常
// 然后通过具体的 Tab 逻辑去禁用 Dashboard 页面的侧边栏
chrome.sidePanel.setOptions({ enabled: true, path: 'popup/popup.html' });

/**
 * 辅助函数：根据 URL 控制侧边栏显隐
 */
async function updateSidePanelState(tabId, url) {
    if (!url) return;

    // 使用更宽松的匹配
    if (url.includes('/dashboard/dashboard.html')) {
        // 在 Dashboard 页面禁用侧边栏
        console.log(`[SidePanel] Disabling for tab ${tabId} (Dashboard)`);
        await chrome.sidePanel.setOptions({
            tabId,
            enabled: false
        });
    } else {
        // 其他页面显式启用，确保从 Dashboard 切换回来时能恢复
        await chrome.sidePanel.setOptions({
            tabId,
            enabled: true,
            path: 'popup/popup.html'
        });
    }
}

/**
 * 初始化：遍历所有标签页设置正确的侧边栏状态
 */
async function initSidePanelState() {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (tab.url) {
            updateSidePanelState(tab.id, tab.url);
        }
    }
}

// 启动时初始化
initSidePanelState();

/**
 * 监听标签页切换
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) {
            updateSidePanelState(activeInfo.tabId, tab.url);

            // 自动重新打开 side panel 逻辑
            const isDashboard = tab.url.includes('/dashboard/dashboard.html');

            if (!isDashboard && sidePanelState.wasOpenBeforeDashboard) {
                // 不在 dashboard 页面，且之前打开过 side panel
                // 自动重新打开 side panel
                console.log('[Background] Auto-reopening side panel for window:', tab.windowId);
                try {
                    await chrome.sidePanel.open({ windowId: tab.windowId });
                    // 重新打开后清除状态
                    sidePanelState.wasOpenBeforeDashboard = false;
                    sidePanelState.lastWindowId = null;
                } catch (error) {
                    console.error('[Background] Failed to reopen side panel:', error);
                }
            }
        }
    } catch (e) {
        // Ignore errors
    }
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

    // 即使 changeInfo 中没有 URL，也要检查当前的 tab.url
    if (tab.url) {
        updateSidePanelState(tabId, tab.url);
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

/**
 * 设置右键菜单，允许用户打开侧边栏
 */
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'openSidePanel',
        title: 'Open Side Panel',
        contexts: ['all']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'openSidePanel') {
        // 打开当前标签页的侧边栏
        chrome.sidePanel.open({ windowId: tab.windowId });
    }
});
