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

// =============================================
// Global State Manager - 全局状态管理器
// =============================================
// 用于跨 popup/side panel/dashboard 同步状态

const DEFAULT_GLOBAL_STATE = {
    selectedTabIds: [],      // 当前选中的模型标签页
    promptInput: '',         // 当前输入的 prompt
    promptHistory: [],       // Prompt 历史记录
    newContentTabs: {},      // Tab ID -> 新内容计数
    sidePanelPinned: false   // Side Panel 是否固定打开
};

// 内存中的全局状态缓存
let globalState = { ...DEFAULT_GLOBAL_STATE };

// Side Panel 临时状态（用于 dashboard 自动重开）
let sidePanelTempState = {
    wasOpenBeforeDashboard: false,
    lastWindowId: null
};

/**
 * 初始化全局状态 - 从 chrome.storage.local 加载
 */
async function initGlobalState() {
    try {
        const stored = await chrome.storage.local.get('globalState');
        if (stored.globalState) {
            globalState = { ...DEFAULT_GLOBAL_STATE, ...stored.globalState };
            console.log('[Background] Global state loaded:', globalState);
        }
    } catch (error) {
        console.error('[Background] Failed to load global state:', error);
    }
}

/**
 * 保存全局状态到 chrome.storage.local
 */
async function saveGlobalState() {
    try {
        await chrome.storage.local.set({ globalState });
    } catch (error) {
        console.error('[Background] Failed to save global state:', error);
    }
}

/**
 * 更新全局状态并广播变化
 * @param {object} updates - 要更新的状态字段
 * @param {boolean} persist - 是否持久化保存（默认 true）
 */
async function updateGlobalState(updates, persist = true) {
    globalState = { ...globalState, ...updates };

    if (persist) {
        await saveGlobalState();
    }

    // 广播状态变化到所有 UI 页面
    broadcastStateChange();
}

/**
 * 广播状态变化到所有 UI 页面
 * 使用多种方式确保消息到达
 */
async function broadcastStateChange() {
    const message = { type: 'STATE_CHANGED', state: globalState };

    console.log('[Background] Broadcasting state change...');

    // 方法1: 直接访问所有扩展视图并调用其处理函数
    try {
        const allViews = chrome.extension.getViews();
        for (const view of allViews) {
            try {
                // 直接调用视图的全局处理函数（如果存在）
                if (typeof view.handleGlobalStateChange === 'function') {
                    view.handleGlobalStateChange(globalState);
                }
            } catch (e) {
                console.log('[Background] View broadcast error:', e);
            }
        }
        console.log(`[Background] Direct view broadcast to ${allViews.length} views`);
    } catch (e) {
        console.error('[Background] Failed to get views:', e);
    }

    // 方法2: 广播到所有 dashboard 标签页
    try {
        const dashboardUrl = chrome.runtime.getURL('dashboard/dashboard.html');
        const tabs = await chrome.tabs.query({ url: dashboardUrl });
        for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, message).catch(() => { });
        }
        console.log(`[Background] Dashboard broadcast to ${tabs.length} tabs`);
    } catch (e) {
        console.error('[Background] Dashboard broadcast error:', e);
    }

    // 方法3: 通用广播 (确保 Side Panel 等能收到)
    try {
        chrome.runtime.sendMessage(message).catch(() => {
            // 如果没有接收者（例如没有打开的 popup/sidepanel），这里会报错，可以忽略
        });
    } catch (e) {
        // Ignore
    }

    console.log('[Background] State broadcast complete');
}

// 初始化全局状态
initGlobalState();


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

                        const historyEntry = {
                            timestamp: new Date().toISOString(),
                            prompt: message.prompt,
                            targets
                        };

                        // Update global state with new history entry
                        let newHistory = [historyEntry, ...globalState.promptHistory];
                        if (newHistory.length > settings.maxHistoryEntries) {
                            newHistory = newHistory.slice(0, settings.maxHistoryEntries);
                        }
                        await updateGlobalState({ promptHistory: newHistory });
                    }

                    sendResponse({ success: true, results });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case 'GET_PROMPT_HISTORY':
            // Get prompt history for export
            sendResponse({ success: true, history: globalState.promptHistory });
            return true;

        case 'CLEAR_PROMPT_HISTORY':
            // Clear prompt history
            (async () => {
                await updateGlobalState({ promptHistory: [] });
                sendResponse({ success: true });
            })();
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
                sidePanelTempState.wasOpenBeforeDashboard = message.wasOpen;
                sidePanelTempState.lastWindowId = message.windowId;
                console.log('[Background] Side panel temp state updated:', sidePanelTempState);
            }
            sendResponse({ success: true });
            break;

        case 'CLEAR_SIDEPANEL_STATE':
        case 'CLOSE_ALL_SIDEPANELS':
            // 用户手动关闭 side panel
            (async () => {
                // 1. 清除所有状态
                sidePanelTempState.wasOpenBeforeDashboard = false;
                sidePanelTempState.lastWindowId = null;
                await updateGlobalState({ sidePanelPinned: false });
                
                // 2. 强制关闭：通过瞬间禁用所有标签页的 Side Panel 权限来实现
                console.log('[Background] Force closing all side panels...');
                await forceCloseAllSidePanels();
                
                sendResponse({ success: true });
            })();
            return true;

        case 'GET_GLOBAL_STATE':
            // 获取全局状态
            sendResponse({ success: true, state: globalState });
            break;

        case 'SET_GLOBAL_STATE':
            // 更新全局状态
            (async () => {
                if (message.updates) {
                    await updateGlobalState(message.updates);
                    console.log('[Background] Global state updated:', message.updates);
                }
                sendResponse({ success: true, state: globalState });
            })();
            return true;

        case 'SET_SIDEPANEL_PINNED':
            // 设置 side panel 固定状态
            (async () => {
                await updateGlobalState({ sidePanelPinned: message.pinned });
                console.log('[Background] Side panel pinned:', message.pinned);
                sendResponse({ success: true });
            })();
            return true;

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
 * 强制关闭所有侧边栏
 * 通过先禁用再启用的方式，强制浏览器关闭所有标签页的侧边栏 UI
 */
async function forceCloseAllSidePanels() {
    try {
        // 1. 获取所有标签页
        const tabs = await chrome.tabs.query({});
        
        // 2. 批量禁用 (这会强制关闭 UI)
        const disablePromises = tabs.map(tab => 
            chrome.sidePanel.setOptions({
                tabId: tab.id,
                enabled: false
            }).catch(() => {}) // 忽略错误
        );
        
        // 同时也禁用全局默认
        disablePromises.push(
            chrome.sidePanel.setOptions({ enabled: false }).catch(() => {})
        );
        
        await Promise.all(disablePromises);
        console.log('[Background] All side panels disabled (forced closed)');
        
        // 3. 稍等片刻让 UI 反应
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 4. 恢复启用 (以便下次能打开)，但不自动打开
        // 注意：我们只恢复那些"应该"被启用的标签页 (非 Dashboard)
        const enablePromises = tabs.map(tab => {
            if (tab.url && !tab.url.includes('/dashboard/dashboard.html')) {
                return chrome.sidePanel.setOptions({
                    tabId: tab.id,
                    enabled: true,
                    path: 'popup/popup.html'
                }).catch(() => {});
            }
            return Promise.resolve();
        });
        
        // 恢复全局默认
        enablePromises.push(
            chrome.sidePanel.setOptions({ 
                enabled: true, 
                path: 'popup/popup.html' 
            }).catch(() => {})
        );
        
        await Promise.all(enablePromises);
        console.log('[Background] Side panel permissions restored');
        
    } catch (error) {
        console.error('[Background] Error in forceCloseAllSidePanels:', error);
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

            if (!isDashboard && sidePanelTempState.wasOpenBeforeDashboard) {
                // 不在 dashboard 页面，且之前打开过 side panel
                // 自动重新打开 side panel
                console.log('[Background] Auto-reopening side panel for window:', tab.windowId);
                try {
                    // Ensure state is synced
                    await updateGlobalState({ sidePanelPinned: true });
                    await chrome.sidePanel.open({ windowId: tab.windowId });
                    // 重新打开后清除状态
                    sidePanelTempState.wasOpenBeforeDashboard = false;
                    sidePanelTempState.lastWindowId = null;
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
        // Explicitly set pinned state
        updateGlobalState({ sidePanelPinned: true });
        // 打开当前标签页的侧边栏
        chrome.sidePanel.open({ windowId: tab.windowId });
    }
});