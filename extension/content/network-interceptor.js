/**
 * Universal Network Interceptor - 通用网络拦截器
 * 支持多个 LLM 平台的流式响应拦截
 * 直接从网络层获取数据，不依赖 DOM 渲染
 */

(function () {
    'use strict';

    // ============ 平台配置 ============
    const PLATFORM_CONFIGS = {
        // ChatGPT
        chatgpt: {
            name: 'ChatGPT',
            icon: '💚',
            hostPatterns: ['chat.openai.com', 'chatgpt.com'],
            apiPatterns: ['/backend-api/f/conversation', '/v1/chat/completions'],
            parseResponse: (json) => {
                // ChatGPT 格式: {"v": "文本内容"}
                if (json.v && typeof json.v === 'string') {
                    return { content: json.v, isDelta: true };
                }
                if (json.message?.content?.parts) {
                    return { content: json.message.content.parts.join(''), isDelta: false };
                }
                return null;
            }
        },

        // Claude
        claude: {
            name: 'Claude',
            icon: '🧡',
            hostPatterns: ['claude.ai'],
            apiPatterns: ['/api/organizations/', '/api/append_message', '/api/chat_conversations'],
            parseResponse: (json) => {
                // Claude 格式: {"completion": "文本"} 或 {"delta": {"text": "文本"}}
                if (json.completion) {
                    return { content: json.completion, isDelta: true };
                }
                if (json.delta?.text) {
                    return { content: json.delta.text, isDelta: true };
                }
                if (json.content && Array.isArray(json.content)) {
                    const textContent = json.content.filter(c => c.type === 'text').map(c => c.text).join('');
                    return { content: textContent, isDelta: false };
                }
                return null;
            }
        },

        // Gemini
        gemini: {
            name: 'Gemini',
            icon: '💙',
            hostPatterns: ['gemini.google.com', 'aistudio.google.com'],
            apiPatterns: ['batchexecute', 'streamGenerateContent', '/v1beta/models/'],
            parseResponse: (json) => {
                // 情况 1: AI Studio API 格式
                if (json.candidates?.[0]?.content?.parts) {
                    const text = json.candidates[0].content.parts.map(p => p.text || '').join('');
                    return { content: text, isDelta: false };
                }

                // 情况 2: Gemini (Bard) Web 端 batchexecute 格式
                // 这种格式通常是一个深度嵌套的数组
                try {
                    // 递归查找响应中可能包含的大段文本
                    // 递归查找响应中可能包含的大段文本
                    function findLongestString(obj, depth = 0) {
                        if (depth > 20) return ''; // 略微增加深度限制

                        let longest = '';

                        if (typeof obj === 'string') {
                            // 1. 尝试解包：如果它是 JSON 字符串，优先递归解析，绝不直接返回容器字符串
                            if (obj.length > 2 && (obj.startsWith('[') || obj.startsWith('{'))) {
                                try {
                                    const inner = JSON.parse(obj);
                                    const found = findLongestString(inner, depth + 1);
                                    // 只有子元素找到了有效文本，才认为由于
                                    // 注意：这里我们完全信任递归的结果。如果递归解包成功，绝不要回退到返回 obj 原文。
                                    return found;
                                } catch (e) {
                                    // 解析失败，说明它可能就是普通文本，或者格式错误的 JSON，继续往下走
                                }
                            }

                            // 2. 文本清洗与筛选
                            // 排除空串、协议关键字、base64、样式、代码片段等噪点
                            const isNoisy = obj.length < 1 || // 允许短回复 "Hi"
                                obj.includes('wrb.fr') ||
                                obj.includes('atF01d') ||
                                obj.includes('base64,') ||
                                obj.startsWith('data:') ||
                                (obj.includes('font-family') && obj.includes(';')) || // 样式
                                (obj.includes('background-color') && obj.includes(';'));

                            if (!isNoisy) {
                                return obj;
                            }
                            return '';
                        }

                        else if (Array.isArray(obj)) {
                            for (const item of obj) {
                                // 数组遍历，寻找最长的子结果
                                const found = findLongestString(item, depth + 1);
                                if (found && found.length > longest.length) {
                                    longest = found;
                                }
                            }
                        }

                        else if (typeof obj === 'object' && obj !== null) {
                            for (const key in obj) {
                                const found = findLongestString(obj[key], depth + 1);
                                // 对象遍历
                                if (found && found.length > longest.length) {
                                    longest = found;
                                }
                            }
                        }

                        return longest;
                    }

                    // 优先对 batchexecute 的 atF01d 结构进行精准匹配
                    if (Array.isArray(json)) {
                        for (const wrapper of json) {
                            if (Array.isArray(wrapper) && wrapper[0] === 'wrb.fr' && wrapper[1] === 'atF01d') {
                                try {
                                    const innerData = JSON.parse(wrapper[2]);
                                    // atF01d 的回答内容通常在 [1][0][0] 位置，或者是嵌套在该结构中的字符串
                                    const text = findLongestString(innerData);
                                    if (text && text.length > 20) {
                                        return { content: text, isDelta: false };
                                    }
                                } catch (e) { }
                            }
                        }
                    }

                    // 兜底方案：查找整个 JSON 树中最长的非噪点字符串
                    const longest = findLongestString(json);
                    if (longest && longest.length > 50) {
                        return { content: longest, isDelta: false };
                    }
                } catch (e) {
                    console.debug('[MultiLLM Network] Gemini parse error:', e);
                }

                return null;
            }
        },

        // Grok (X.AI)
        grok: {
            name: 'Grok',
            icon: '🖤',
            hostPatterns: ['grok.com', 'grok.x.ai', 'x.com'],
            apiPatterns: ['/api/rpc/', '/grok/'],
            parseResponse: (json) => {
                // Grok 格式推测
                if (json.text) {
                    return { content: json.text, isDelta: true };
                }
                if (json.message?.text) {
                    return { content: json.message.text, isDelta: false };
                }
                if (json.result?.text) {
                    return { content: json.result.text, isDelta: false };
                }
                return null;
            }
        },

        // DeepSeek
        deepseek: {
            name: 'DeepSeek',
            icon: '🔵',
            hostPatterns: ['chat.deepseek.com'],
            apiPatterns: ['/api/v0/chat/', '/api/chat/'],
            parseResponse: (json) => {
                // DeepSeek 使用类 OpenAI 格式
                if (json.choices?.[0]?.delta?.content) {
                    return { content: json.choices[0].delta.content, isDelta: true };
                }
                if (json.choices?.[0]?.message?.content) {
                    return { content: json.choices[0].message.content, isDelta: false };
                }
                if (json.content) {
                    return { content: json.content, isDelta: true };
                }
                return null;
            }
        },

        // 通义千问 Qwen
        qwen: {
            name: 'Qwen',
            icon: '💜',
            hostPatterns: ['tongyi.aliyun.com', 'qianwen.aliyun.com'],
            apiPatterns: ['/api/v2/chat/', '/dialog/conversation'],
            parseResponse: (json) => {
                // 通义千问格式
                if (json.content) {
                    return { content: json.content, isDelta: true };
                }
                if (json.text) {
                    return { content: json.text, isDelta: true };
                }
                if (json.data?.content) {
                    return { content: json.data.content, isDelta: true };
                }
                if (json.output?.text) {
                    return { content: json.output.text, isDelta: false };
                }
                return null;
            }
        },

        // 豆包 Doubao
        doubao: {
            name: 'Doubao',
            icon: '🟠',
            hostPatterns: ['www.doubao.com', 'doubao.com'],
            apiPatterns: ['/api/chat/', '/samantha/chat/'],
            parseResponse: (json) => {
                // 豆包格式
                if (json.data?.text) {
                    return { content: json.data.text, isDelta: true };
                }
                if (json.text) {
                    return { content: json.text, isDelta: true };
                }
                if (json.message?.content) {
                    return { content: json.message.content, isDelta: true };
                }
                return null;
            }
        },

        // 智谱清言 GLM
        glm: {
            name: 'GLM',
            icon: '🟢',
            hostPatterns: ['chatglm.cn', 'zhipuai.cn'],
            apiPatterns: ['/api/chatglm/', '/dialog/', '/paas/v4/chat/'],
            parseResponse: (json) => {
                // 智谱格式
                if (json.choices?.[0]?.delta?.content) {
                    return { content: json.choices[0].delta.content, isDelta: true };
                }
                if (json.data?.choices?.[0]?.content) {
                    return { content: json.data.choices[0].content, isDelta: true };
                }
                if (json.content) {
                    return { content: json.content, isDelta: true };
                }
                return null;
            }
        },

        // MiniMax / 海螺AI
        minimax: {
            name: 'MiniMax',
            icon: '🐚',
            hostPatterns: ['hailuoai.com', 'api.minimax.chat'],
            apiPatterns: ['/api/chat/', '/v1/text/chatcompletion'],
            parseResponse: (json) => {
                // MiniMax 格式
                if (json.reply) {
                    return { content: json.reply, isDelta: false };
                }
                if (json.choices?.[0]?.delta?.content) {
                    return { content: json.choices[0].delta.content, isDelta: true };
                }
                if (json.choices?.[0]?.text) {
                    return { content: json.choices[0].text, isDelta: true };
                }
                return null;
            }
        },

        // Kimi (月之暗面)
        kimi: {
            name: 'Kimi',
            icon: '🌙',
            hostPatterns: ['kimi.moonshot.cn'],
            apiPatterns: ['/api/chat/', '/api/chat/completion'],
            parseResponse: (json) => {
                // Kimi 格式
                if (json.text) {
                    return { content: json.text, isDelta: true };
                }
                if (json.event === 'cmpl' && json.text) {
                    return { content: json.text, isDelta: true };
                }
                if (json.choices?.[0]?.delta?.content) {
                    return { content: json.choices[0].delta.content, isDelta: true };
                }
                return null;
            }
        }
    };

    // ============ 检测当前平台 ============
    function detectPlatform() {
        const hostname = window.location.hostname;
        for (const [key, config] of Object.entries(PLATFORM_CONFIGS)) {
            if (config.hostPatterns.some(pattern => hostname.includes(pattern))) {
                return { key, config };
            }
        }
        return null;
    }

    const platform = detectPlatform();
    if (!platform) {
        console.log('[MultiLLM Network] Unknown platform, skipping...');
        return;
    }

    console.log(`[MultiLLM Network] Initializing for ${platform.config.name}...`);

    // ============ 保存原始函数 ============
    const originalFetch = window.fetch;

    // ============ 响应状态 ============
    let currentResponse = {
        content: '',
        isGenerating: false,
        timestamp: 0
    };

    // ============ 发送更新 ============
    function sendUpdate(content, isGenerating) {
        if (!content) return;

        const now = Date.now();
        const timeSinceLastUpdate = now - currentResponse.timestamp;

        // 【核心保护】防回滚逻辑
        // 如果当前正在生成中，我们需要非常小心地处理变短的更新
        if (currentResponse.isGenerating) {
            // 1. 如果新 update 又是 generating，但内容大幅缩水
            if (isGenerating && content.length < currentResponse.content.length * 0.8) {
                // 【关键修复】引入时间维度：区分 "乱序抖动" 和 "新一轮对话"
                // 如果距离上次更新很短 (< 2秒)，极大可能是网络乱序或解析错误 -> 拦截
                if (timeSinceLastUpdate < 2000) {
                    console.warn(`[MultiLLM Network] 🛡️ Update ignored (Rollback protection: ${content.length} < ${currentResponse.content.length}, dt=${timeSinceLastUpdate}ms)`);
                    return;
                } else {
                    console.log(`[MultiLLM Network] 🔄 New turn detected (Reset: ${content.length} chars after ${timeSinceLastUpdate}ms)`);
                }
            }

            // 2. 如果新 update 是 DONE (false)，但内容大幅缩水
            // 同样适用时间逻辑：如果是瞬间完成的短包，可能是杂音；如果是很久之后的短包，可能是新对话结束（虽然罕见）
            if (!isGenerating && content.length < currentResponse.content.length * 0.8) {
                if (timeSinceLastUpdate < 2000) {
                    console.warn(`[MultiLLM Network] 🛡️ Update ignored (Premature DONE protection: ${content.length} < ${currentResponse.content.length}, dt=${timeSinceLastUpdate}ms)`);
                    return;
                }
            }
        }

        console.log(`[MultiLLM Network] Sending update to dashboard (${content.length} chars, generating: ${isGenerating})`);

        currentResponse = {
            content: content,
            isGenerating: isGenerating,
            timestamp: now
        };

        window.postMessage({
            source: 'MULTILLM_NETWORK',
            type: 'NETWORK_RESPONSE_UPDATE',
            data: {
                platform: platform.key,
                platformName: platform.config.name,
                platformIcon: platform.config.icon,
                role: 'assistant',
                content: content,
                isGenerating: isGenerating,
                timestamp: Date.now()
            }
        }, '*');
    }

    // ============ 检测是否是目标 API ============
    function isTargetAPI(url) {
        const urlStr = typeof url === 'string' ? url : url.toString();
        return platform.config.apiPatterns.some(pattern => urlStr.includes(pattern));
    }

    // ============ 处理 SSE 流 ============
    async function processSSEStream(response, url) {
        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        console.log(`[MultiLLM Network] Processing stream for: ${url.substring(0, 80)}...`);

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    console.log(`[MultiLLM Network] Stream complete, total: ${fullContent.length} chars`);
                    sendUpdate(fullContent, false);
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // 解析 SSE 数据
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();

                        if (dataStr === '[DONE]' || dataStr === '') {
                            sendUpdate(fullContent, false);
                            continue;
                        }

                        try {
                            const json = JSON.parse(dataStr);
                            const result = platform.config.parseResponse(json);

                            if (result && result.content) {
                                if (result.isDelta) {
                                    fullContent += result.content;
                                } else {
                                    fullContent = result.content;
                                }
                                sendUpdate(fullContent, true);
                            }
                        } catch (e) {
                            // 尝试直接解析整行
                            try {
                                const json = JSON.parse(line);
                                const result = platform.config.parseResponse(json);
                                if (result && result.content) {
                                    if (result.isDelta) {
                                        fullContent += result.content;
                                    } else {
                                        fullContent = result.content;
                                    }
                                    sendUpdate(fullContent, true);
                                }
                            } catch (e2) { }
                        }
                    } else if (line.trim() && !line.startsWith('event:')) {
                        // 尝试直接解析非 SSE 格式
                        try {
                            const json = JSON.parse(line);
                            const result = platform.config.parseResponse(json);
                            if (result && result.content) {
                                if (result.isDelta) {
                                    fullContent += result.content;
                                } else {
                                    fullContent = result.content;
                                }
                                sendUpdate(fullContent, true);
                            }
                        } catch (e) { }
                    }
                }
            }
        } catch (error) {
            console.error('[MultiLLM Network] Stream error:', error);
            sendUpdate(fullContent, false);
        }
    }

    // ============ 包装 Fetch ============
    window.fetch = async function (...args) {
        const [url, options] = args;
        const urlString = typeof url === 'string' ? url : (url?.url || url?.toString() || '');

        // 调用原始 fetch
        const response = await originalFetch.apply(this, args);

        // 检测是否是目标 API
        if (isTargetAPI(urlString) && response.ok) {
            console.log(`[MultiLLM Network] ✅ Detected ${platform.config.name} API (fetch): ${urlString.substring(0, 60)}...`);

            if (response.body) {
                const clonedResponse = response.clone();
                processSSEStream(clonedResponse, urlString);
            }
        }

        return response;
    };

    // ============ 包装 XMLHttpRequest（用于 Gemini 等使用 XHR 的平台） ============
    const OriginalXHR = window.XMLHttpRequest;

    window.XMLHttpRequest = function () {
        const xhr = new OriginalXHR();
        const originalOpen = xhr.open;
        const originalSend = xhr.send;
        let requestUrl = '';
        let xhrFullContent = ''; // 用于累积当前 XHR 的完整响应内容
        let lastParsedLength = 0; // 记录上次解析的长度，避免重复处理

        xhr.open = function (method, url, ...rest) {
            requestUrl = url;
            return originalOpen.apply(this, [method, url, ...rest]);
        };

        xhr.send = function (body) {
            // 监听响应
            xhr.addEventListener('readystatechange', function () {
                // 支持 readyState 3 (LOADING) 以实现流式同步，4 (DONE) 则是最终结果
                if ((xhr.readyState === 3 || xhr.readyState === 4) && xhr.status === 200 && isTargetAPI(requestUrl)) {
                    try {
                        const responseText = xhr.responseText;
                        // 仅在内容没有变化 且 状态也没有变为DONE时 才跳过
                        // 如果状态变为 4 (DONE)，即使内容没变，也需要执行下去以发送 isGenerating: false
                        if (!responseText || (responseText.length === lastParsedLength && xhr.readyState !== 4)) return;

                        // 更新本次 XHR 的完整内容
                        xhrFullContent = responseText;
                        lastParsedLength = responseText.length;

                        // Gemini 的响应是特殊格式，可能以 )]}' 开头，或者包含多个 JSON 块
                        let cleanedResponse = xhrFullContent;
                        if (cleanedResponse.startsWith(")]}'\n")) {
                            cleanedResponse = cleanedResponse.slice(5);
                        }

                        // 针对 batchexecute 的特殊解析逻辑
                        // 它的格式通常是: 长度\n[JSON]\n长度\n[JSON]...
                        // 或者直接是 [JSON]

                        let foundContent = false;
                        let bestContentOnThisXHR = ''; // 存储本次 XHR 状态更新中找到的最佳内容

                        // 尝试直接解析为完整 JSON
                        try {
                            const json = JSON.parse(cleanedResponse);
                            const result = platform.config.parseResponse(json);
                            if (result && result.content) {
                                bestContentOnThisXHR = result.content;
                                foundContent = true;
                            }
                        } catch (e) {
                            // 失败，可能是多个 JSON 块叠加
                            // 使用简单的正则提取所有的 [ ... ] 或 { ... } 结构
                            // 注意：这可能不太严谨，但对于提取回答内容通常有效
                            const blocks = [];

                            // 暴力拆分：按数字长度前缀拆分，或者寻找匹配的括号
                            // 这里采用按行拆分并清理数字前缀的逻辑
                            const lines = cleanedResponse.split('\n');

                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (!trimmed) continue;

                                // 如果是纯数字，可能是长度前缀
                                if (/^\d+$/.test(trimmed)) {
                                    continue;
                                }

                                try {
                                    const json = JSON.parse(trimmed);
                                    blocks.push(json);
                                } catch (e2) {
                                    // 可能是跨行的 JSON，继续累加
                                    // 但在 batchexecute 中通常块是单行的
                                }
                            }

                            // 遍历所有解析出来的块
                            for (const block of blocks) {
                                const result = platform.config.parseResponse(block);
                                if (result && result.content) {
                                    // 取当前 XHR 中最长的一个块
                                    if (result.content.length > bestContentOnThisXHR.length) {
                                        bestContentOnThisXHR = result.content;
                                    }
                                }
                            }
                        }

                        if (bestContentOnThisXHR) {
                            // 只有在 readyState 3 (LOADING) 时，才进行长度保护，防止回退
                            // readyState 4 (DONE) 时，接受最终结果，即使它可能比中间状态短
                            const isGenerating = xhr.readyState === 3;
                            if (isGenerating && currentResponse.content && bestContentOnThisXHR.length < currentResponse.content.length * 0.4) {
                                // console.debug('[MultiLLM Network] XHR update ignored to prevent rollback (LOADING state)', bestContentOnThisXHR.length, 'vs', currentResponse.content.length);
                            } else {
                                sendUpdate(bestContentOnThisXHR, isGenerating);
                                foundContent = true; // 标记为已找到内容并发送更新
                            }
                        }

                        if (!foundContent && platform.key === 'gemini') {
                            // Gemini 特有的兜底：如果还没找到，且包含 Stream 字样，记录一下用于调试
                            if (requestUrl.includes('Stream')) {
                                // console.debug('[MultiLLM Network] Unparsed Gemini Stream chunk:', responseText.substring(0, 100));
                            }
                        }
                    } catch (error) {
                        // 避免在 readystatechange 3 时频繁报错
                        if (xhr.readyState === 4) {
                            console.error('[MultiLLM Network] XHR parse error:', error);
                        }
                    }
                }
            });

            return originalSend.apply(this, [body]);
        };

        return xhr;
    };

    // 保持 XMLHttpRequest 的静态属性
    window.XMLHttpRequest.UNSENT = OriginalXHR.UNSENT;
    window.XMLHttpRequest.OPENED = OriginalXHR.OPENED;
    window.XMLHttpRequest.HEADERS_RECEIVED = OriginalXHR.HEADERS_RECEIVED;
    window.XMLHttpRequest.LOADING = OriginalXHR.LOADING;
    window.XMLHttpRequest.DONE = OriginalXHR.DONE;

    // ============ 导出函数 ============
    window.getLatestNetworkResponse = function () {
        return currentResponse;
    };

    window.getCurrentPlatform = function () {
        return platform;
    };

    console.log(`[MultiLLM Network] ${platform.config.name} interceptor ready (fetch + XHR)`);
})();
