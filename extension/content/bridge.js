/**
 * Bridge Script - 运行在 ISOLATED 世界
 * 负责在 MAIN 世界（适配器）和 Background Script 之间传递消息
 */

(function () {
    'use strict';

    console.log('[MultiLLM Bridge] Initialized');

    // 监听来自 MAIN 世界的消息（包括适配器和网络拦截器）
    window.addEventListener('message', (event) => {
        // 只处理来自当前页面的消息
        if (event.source !== window) return;

        const message = event.data;

        // 处理来自网络拦截器的消息
        if (message && message.source === 'MULTILLM_NETWORK') {
            console.log('[Bridge] Received from Network Interceptor:', message.type);

            // 将网络拦截器的更新转发给 Background
            // 使用网络拦截器提供的平台信息
            try {
                chrome.runtime.sendMessage({
                    type: 'RESPONSE_UPDATE',
                    data: {
                        response: message.data,
                        platform: message.data.platform || 'unknown',
                        displayName: message.data.platformName || 'Unknown',
                        icon: message.data.platformIcon || '🤖',
                        source: 'network'
                    }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[Bridge] Network update error:', chrome.runtime.lastError);
                    } else {
                        console.log('[Bridge] ✅ Network update forwarded to Background');
                    }
                });
            } catch (error) {
                console.error('[Bridge] Network update exception:', error);
            }
            return;
        }

        // 只处理来自适配器的消息
        if (!message || message.source !== 'MULTILLM_MAIN') return;

        console.log('[Bridge] Received from MAIN:', message.type);

        // 立即转发给 Background（不延迟）
        try {
            chrome.runtime.sendMessage({
                type: message.type,
                data: message.data
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Bridge] Error sending to Background:', chrome.runtime.lastError);
                } else {
                    console.log('[Bridge] Sent to Background successfully:', message.type);
                }
                // 将响应发回 MAIN 世界
                window.postMessage({
                    source: 'MULTILLM_ISOLATED',
                    requestId: message.requestId,
                    response: response
                }, '*');
            });
        } catch (error) {
            console.error('[Bridge] Exception sending to Background:', error);
        }
    });

    // 监听来自 Background 的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[Bridge] Received from Background:', message.type);

        // 转发给 MAIN 世界
        window.postMessage({
            source: 'MULTILLM_BACKGROUND',
            type: message.type,
            data: message
        }, '*');

        // 对于需要响应的消息，等待 MAIN 世界回复
        if (message.type === 'SEND_PROMPT' ||
            message.type === 'GET_STATUS' ||
            message.type === 'START_OBSERVING' ||
            message.type === 'STOP_OBSERVING' ||
            message.type === 'GET_LATEST_RESPONSE') {

            // 创建一个一次性监听器等待响应
            const responseHandler = (event) => {
                if (event.source !== window) return;
                const reply = event.data;
                if (reply && reply.source === 'MULTILLM_MAIN_RESPONSE' && reply.requestType === message.type) {
                    window.removeEventListener('message', responseHandler);
                    sendResponse(reply.response);
                }
            };

            window.addEventListener('message', responseHandler);

            // 返回 true 表示异步响应
            return true;
        }

        sendResponse({ success: true });
    });

    // 通知 Background 此页面已就绪
    function notifyReady() {
        chrome.runtime.sendMessage({
            type: 'CONTENT_READY',
            data: { ready: true }
        });
    }

    if (document.readyState === 'complete') {
        notifyReady();
    } else {
        window.addEventListener('load', notifyReady);
    }

})();
