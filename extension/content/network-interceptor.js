/**
 * Network Interceptor - 拦截 ChatGPT 的网络请求
 * 直接从网络层获取流式响应，不依赖 DOM 渲染
 * 支持 fetch 和 WebSocket
 */

(function () {
    'use strict';

    console.log('[MultiLLM Network] Initializing network interceptor...');

    // 保存原始函数
    const originalFetch = window.fetch;
    const OriginalWebSocket = window.WebSocket;

    // 用于累积响应内容
    let currentResponse = {
        content: '',
        isGenerating: false,
        timestamp: 0
    };

    // 发送更新到 Bridge（然后转发到 Dashboard）
    function sendUpdate(content, isGenerating) {
        if (!content) return;

        currentResponse = {
            content: content,
            isGenerating: isGenerating,
            timestamp: Date.now()
        };

        // 发送到 MAIN 世界的消息监听器
        window.postMessage({
            source: 'MULTILLM_NETWORK',
            type: 'NETWORK_RESPONSE_UPDATE',
            data: {
                role: 'assistant',
                content: content,
                isGenerating: isGenerating,
                timestamp: Date.now()
            }
        }, '*');

        console.log('[MultiLLM Network] Sent update, length:', content.length, 'generating:', isGenerating);
    }

    // 解析 ChatGPT 响应数据
    function parseResponseData(data) {
        try {
            if (typeof data === 'string') {
                // 处理 SSE 格式
                if (data.startsWith('data: ')) {
                    data = data.slice(6);
                }
                if (data === '[DONE]') return null;
                data = JSON.parse(data);
            }

            // ChatGPT 新格式：使用 "v" 字段存储增量文本
            if (data.v && typeof data.v === 'string') {
                return data.v;
            }

            // 尝试其他可能的数据格式
            if (data.message?.content?.parts) {
                return data.message.content.parts.join('');
            }
            if (data.choices?.[0]?.delta?.content) {
                return data.choices[0].delta.content;
            }
            if (data.choices?.[0]?.message?.content) {
                return data.choices[0].message.content;
            }
            if (data.text) {
                return data.text;
            }
            if (data.response) {
                return data.response;
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    // 处理 SSE 流
    async function processSSEStream(response, url) {
        if (!response.body) {
            console.log('[MultiLLM Network] No response body');
            return;
        }

        // 只处理真正的对话 API
        if (!url.includes('/f/conversation') && !url.includes('/v1/chat')) {
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        console.log('[MultiLLM Network] 🔥 Processing conversation stream for:', url);

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    console.log('[MultiLLM Network] Stream complete, total length:', fullContent.length);
                    sendUpdate(fullContent, false);
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // 打印原始数据（调试用）
                console.log('[MultiLLM Network] Raw chunk:', chunk.substring(0, 200));

                // 解析 SSE 数据
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);

                        if (dataStr === '[DONE]') {
                            console.log('[MultiLLM Network] ✅ Stream complete, content:', fullContent.substring(0, 100));
                            sendUpdate(fullContent, false);
                            continue;
                        }

                        try {
                            const json = JSON.parse(dataStr);

                            const content = parseResponseData(json);
                            if (content) {
                                fullContent += content; // 累加增量内容
                                console.log('[MultiLLM Network] 📝 Content updated:', fullContent.length, 'chars');
                                sendUpdate(fullContent, true);
                            }
                        } catch (e) {
                            // 忽略解析错误
                        }
                    } else if (line.trim()) {
                        // 非 SSE 格式的行（忽略 event: 行）
                    }
                }
            }
        } catch (error) {
            console.error('[MultiLLM Network] Stream error:', error);
            sendUpdate(fullContent, false);
        }
    }

    // 包装 fetch 函数
    window.fetch = async function (...args) {
        const [url, options] = args;
        const urlString = typeof url === 'string' ? url : (url?.url || url?.toString() || '');

        // 记录所有 fetch 请求（调试用）
        console.log('[MultiLLM Network] Fetch request:', urlString.substring(0, 100));

        // 调用原始 fetch
        const response = await originalFetch.apply(this, args);

        // 检测是否是 ChatGPT 的对话 API（扩展匹配范围）
        const isConversationAPI =
            urlString.includes('/backend-api/conversation') ||
            urlString.includes('/api/conversation') ||
            urlString.includes('/v1/chat/completions') ||
            urlString.includes('backend-api') ||
            urlString.includes('/conversation');

        if (isConversationAPI && response.ok) {
            console.log('[MultiLLM Network] ✅ Detected conversation API:', urlString);

            if (response.body) {
                // 克隆响应（因为 body 只能读取一次）
                const clonedResponse = response.clone();
                // 在后台处理 SSE 流
                processSSEStream(clonedResponse, urlString);
            }
        }

        return response;
    };

    // 包装 WebSocket（ChatGPT 可能使用 WebSocket 进行流式通信）
    window.WebSocket = function (url, protocols) {
        console.log('[MultiLLM Network] WebSocket connection:', url.substring(0, 100));

        const ws = protocols
            ? new OriginalWebSocket(url, protocols)
            : new OriginalWebSocket(url);

        let fullContent = '';

        // 监听消息
        const originalOnMessage = ws.onmessage;

        ws.addEventListener('message', function (event) {
            try {
                const data = JSON.parse(event.data);
                console.log('[MultiLLM Network] WebSocket message type:', data.type || 'unknown');

                // 尝试解析内容
                const content = parseResponseData(data);
                if (content) {
                    fullContent += content;
                    sendUpdate(fullContent, true);
                }

                // 检测完成信号
                if (data.type === 'done' || data.type === 'end' || data.finished) {
                    sendUpdate(fullContent, false);
                    fullContent = '';
                }
            } catch (e) {
                // 非 JSON 消息，忽略
            }
        });

        return ws;
    };

    // 保持 WebSocket 的原型链
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;

    // 导出获取最新响应的函数
    window.getLatestNetworkResponse = function () {
        return currentResponse;
    };

    console.log('[MultiLLM Network] Network interceptor ready (fetch + WebSocket)');
})();
