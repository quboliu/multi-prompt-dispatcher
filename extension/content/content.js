/**
 * Content Script 主入口 - 运行在 MAIN 世界
 * 负责执行适配器操作，通过 postMessage 与 Bridge 通信
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

    // ============ 与 Bridge 通信 ============

    /**
     * 发送消息到 Bridge（然后转发到 Background）
     */
    function sendToBridge(type, data) {
        window.postMessage({
            source: 'MULTILLM_MAIN',
            type: type,
            data: data,
            requestId: Date.now() + Math.random()
        }, '*');
    }

    /**
     * 监听来自 Bridge 的消息（来自 Background）
     */
    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;

        const message = event.data;
        if (!message || message.source !== 'MULTILLM_BACKGROUND') return;

        console.log('[MultiLLM] Received from Bridge:', message.type);

        let response = { success: true };

        switch (message.type) {
            case 'PING':
            case 'GET_STATUS':
                response = {
                    success: true,
                    data: adapter.getStatus()
                };
                break;

            case 'SEND_PROMPT':
                try {
                    const result = await adapter.sendPrompt(message.data?.prompt || message.prompt);
                    response = {
                        ...result,
                        platform: adapter.name,
                        displayName: adapter.displayName
                    };
                } catch (error) {
                    response = { success: false, error: error.message };
                }
                break;

            case 'START_OBSERVING':
                startResponseObserving();
                response = { success: true };
                break;

            case 'STOP_OBSERVING':
                stopResponseObserving();
                response = { success: true };
                break;

            case 'GET_LATEST_RESPONSE':
                if (typeof adapter.extractLatestResponse === 'function') {
                    response = { success: true, response: adapter.extractLatestResponse() };
                } else {
                    response = { success: false, error: 'Not supported' };
                }
                break;
        }

        // 发送响应回 Bridge
        window.postMessage({
            source: 'MULTILLM_MAIN_RESPONSE',
            requestType: message.type,
            response: response
        }, '*');
    });

    // ============ Phase 2: 输出监听功能 ============

    let responseObserver = null;
    let isObserving = false;

    /**
     * 启动输出监听
     */
    function startResponseObserving() {
        if (isObserving) {
            console.log('[MultiLLM] Already observing');
            return;
        }

        // 检查适配器是否支持监听
        if (typeof adapter.startObserving !== 'function') {
            console.warn('[MultiLLM] Adapter does not support response observing');
            return;
        }

        responseObserver = adapter.startObserving((response) => {
            // 通过 Bridge 广播响应更新
            sendToBridge('RESPONSE_UPDATE', {
                platform: adapter.name,
                displayName: adapter.displayName,
                icon: adapter.icon,
                response: response
            });
        });

        if (responseObserver) {
            isObserving = true;
            console.log(`[MultiLLM] Started observing ${adapter.displayName} responses`);
        }
    }

    /**
     * 停止输出监听
     */
    function stopResponseObserving() {
        if (!isObserving || !responseObserver) return;

        if (typeof adapter.stopObserving === 'function') {
            adapter.stopObserving(responseObserver);
        }

        responseObserver = null;
        isObserving = false;
        console.log(`[MultiLLM] Stopped observing ${adapter.displayName} responses`);
    }

    // ============ 初始化 ============

    // 通知 Bridge 此页面已就绪（通过 postMessage）
    function notifyReady() {
        sendToBridge('CONTENT_READY', adapter.getStatus());
    }

    // 页面加载完成后通知
    if (document.readyState === 'complete') {
        setTimeout(notifyReady, 100); // 稍微延迟确保 Bridge 已加载
    } else {
        window.addEventListener('load', () => setTimeout(notifyReady, 100));
    }

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            notifyReady();
        }
    });

    // 自动启动监听（可选）
    // setTimeout(startResponseObserving, 500);

})();
