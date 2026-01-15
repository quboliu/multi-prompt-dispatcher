/**
 * Content Script 主入口
 * 负责与 Background Script 通信，执行适配器操作
 */

(function () {
    'use strict';

    // 确保适配器已加载
    if (!window.currentAdapter) {
        console.error('[MultiLLM] No adapter loaded for this page');
        return;
    }

    const adapter = window.currentAdapter;

    // 检查适配器是否匹配当前页面
    if (!adapter.detect()) {
        console.log('[MultiLLM] Adapter does not match current page');
        return;
    }

    console.log(`[MultiLLM] Loaded ${adapter.displayName} adapter`);

    /**
     * 处理来自 Background/Popup 的消息
     */
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[MultiLLM] Received message:', message);

        switch (message.type) {
            case 'PING':
                // 心跳检测，返回适配器状态
                sendResponse({
                    success: true,
                    data: adapter.getStatus()
                });
                break;

            case 'GET_STATUS':
                // 获取详细状态
                sendResponse({
                    success: true,
                    data: adapter.getStatus()
                });
                break;

            case 'SEND_PROMPT':
                // 发送 prompt
                handleSendPrompt(message.prompt)
                    .then(result => {
                        sendResponse(result);
                    })
                    .catch(error => {
                        sendResponse({
                            success: false,
                            error: error.message
                        });
                    });
                // 返回 true 表示将异步发送响应
                return true;

            default:
                sendResponse({
                    success: false,
                    error: `Unknown message type: ${message.type}`
                });
        }
    });

    /**
     * 处理发送 prompt 请求
     * @param {string} prompt 
     * @returns {Promise<object>}
     */
    async function handleSendPrompt(prompt) {
        if (!prompt || typeof prompt !== 'string') {
            return { success: false, error: '无效的 prompt' };
        }

        console.log(`[MultiLLM] Sending prompt to ${adapter.displayName}:`, prompt.substring(0, 50) + '...');

        const result = await adapter.sendPrompt(prompt);

        console.log(`[MultiLLM] Send result for ${adapter.displayName}:`, result);

        return {
            ...result,
            platform: adapter.name,
            displayName: adapter.displayName
        };
    }

    /**
     * 初始化：通知 Background Script 此页面已就绪
     */
    function notifyReady() {
        try {
            chrome.runtime.sendMessage({
                type: 'CONTENT_READY',
                data: adapter.getStatus()
            });
        } catch (e) {
            // 可能在无效上下文中，忽略
        }
    }

    // 页面加载完成后通知
    if (document.readyState === 'complete') {
        notifyReady();
    } else {
        window.addEventListener('load', notifyReady);
    }

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            notifyReady();
        }
    });

})();
