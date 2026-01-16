/**
 * ChatGPT 适配器
 * 支持 chat.openai.com 和 chatgpt.com
 */
class ChatGPTAdapter extends BaseAdapter {
    constructor() {
        super();
        this.name = 'chatgpt';
        this.displayName = 'ChatGPT';
        this.icon = '💚';
    }

    detect() {
        const hostname = window.location.hostname;
        return hostname === 'chat.openai.com' || hostname === 'chatgpt.com';
    }

    isReady() {
        if (!this.detect()) return false;

        const input = this.getInputElement();
        const sendBtn = this.getSendButton();

        // 检查是否正在生成（发送按钮可能变成停止按钮）
        const stopButton = document.querySelector('[data-testid="stop-button"]');
        if (stopButton) return false;

        return !!(input && sendBtn);
    }

    getInputElement() {
        // ChatGPT 使用 contenteditable div 或 textarea
        // 优先尝试新版 UI 的 textarea
        const selectors = [
            '#prompt-textarea',
            'textarea[data-id="root"]',
            'div[contenteditable="true"][data-placeholder]',
            'textarea[placeholder*="Message"]',
            'textarea[placeholder*="Send"]'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }
        return null;
    }

    getSendButton() {
        // 发送按钮选择器（多种可能的 UI 版本）
        const selectors = [
            '[data-testid="send-button"]',
            'button[data-testid="send-button"]',
            'button[aria-label="Send prompt"]',
            'button[aria-label="Send message"]',
            // 备用：查找包含发送图标的按钮
            'form button[type="submit"]',
            'button.absolute.bottom-0' // 旧版 UI
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (button && !button.disabled) return button;
        }

        // 最后尝试：查找表单中的提交按钮
        const form = document.querySelector('form');
        if (form) {
            const buttons = form.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.type === 'submit' || btn.querySelector('svg')) {
                    return btn;
                }
            }
        }

        return null;
    }

    setPrompt(prompt) {
        const input = this.getInputElement();
        if (!input) return false;

        if (input.tagName === 'TEXTAREA') {
            // Textarea 方式
            input.value = prompt;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (input.contentEditable === 'true') {
            // ContentEditable 方式（新版 UI）
            input.focus();

            // 清空现有内容
            input.innerHTML = '';

            // 创建段落元素
            const p = document.createElement('p');
            p.textContent = prompt;
            input.appendChild(p);

            // 触发 React 事件
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: prompt
            }));
        }

        // 等待 UI 更新
        return true;
    }

    async sendPrompt(prompt) {
        try {
            if (!this.isReady()) {
                return { success: false, error: '页面未就绪，可能正在生成回答' };
            }

            // 设置内容
            if (!this.setPrompt(prompt)) {
                return { success: false, error: '无法设置输入内容' };
            }

            // 等待 UI 响应
            await this.delay(200);

            // 尝试获取发送按钮并点击
            let sendBtn = this.getSendButton();

            // 如果按钮还是禁用状态，再等待一下
            if (!sendBtn || sendBtn.disabled) {
                await this.delay(300);
                sendBtn = this.getSendButton();
            }

            if (!sendBtn) {
                return { success: false, error: '无法找到发送按钮' };
            }

            sendBtn.click();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ============ Phase 2: 输出捕获功能 ============

    /**
     * 获取对话消息容器（包含所有消息）
     * @returns {HTMLElement|null}
     */
    getResponseContainer() {
        // ChatGPT 的消息容器选择器
        const selectors = [
            'main [role="presentation"]',  // 主对话区域
            'main .flex.flex-col',
            '.conversation-turn-wrapper',
            '[data-testid^="conversation-turn"]'
        ];

        for (const selector of selectors) {
            const container = document.querySelector(selector);
            if (container) return container;
        }
        return null;
    }

    /**
     * 提取最新的助手回答
     * @returns {object|null} { role: 'assistant', content: string, isGenerating: boolean }
     */
    extractLatestResponse() {
        try {
            // ChatGPT 的消息以 group 形式组织
            // 查找所有消息组
            const messageGroups = document.querySelectorAll('[data-message-author-role]');

            if (messageGroups.length === 0) return null;

            // 从后往前找第一个 assistant 消息
            for (let i = messageGroups.length - 1; i >= 0; i--) {
                const group = messageGroups[i];
                const role = group.getAttribute('data-message-author-role');

                if (role === 'assistant') {
                    // 提取文本内容
                    const contentElement = group.querySelector('.markdown, [data-message-id]');
                    if (!contentElement) continue;

                    const content = contentElement.innerText || contentElement.textContent || '';

                    // 检查是否正在生成
                    const isGenerating = this.isGenerating();

                    return {
                        role: 'assistant',
                        content: content.trim(),
                        isGenerating: isGenerating,
                        html: contentElement.innerHTML,
                        timestamp: Date.now()
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('[ChatGPT Adapter] Error extracting response:', error);
            return null;
        }
    }

    /**
     * 检查是否正在生成
     * @returns {boolean}
     */
    isGenerating() {
        // 检查停止按钮是否存在
        const stopButton = document.querySelector('[data-testid="stop-button"]');
        if (stopButton) return true;

        // 检查是否有生成指示器
        const generatingIndicators = document.querySelectorAll('.result-streaming, [data-is-streaming="true"]');
        if (generatingIndicators.length > 0) return true;

        return false;
    }

    /**
     * 开始监听输出变化
     * @param {Function} callback - 回调函数，接收 response 对象
     * @returns {MutationObserver}
     */
    startObserving(callback) {
        const container = this.getResponseContainer();
        if (!container) {
            console.error('[ChatGPT Adapter] Response container not found');
            return null;
        }

        let lastContent = '';
        let pendingUpdate = false;

        // 使用 requestAnimationFrame 进行高性能更新
        const processUpdate = () => {
            pendingUpdate = false;

            const response = this.extractLatestResponse();
            if (!response) return;

            // 仅在内容变化时触发回调
            if (response.content !== lastContent) {
                lastContent = response.content;
                callback(response);
            }
        };

        const observer = new MutationObserver((mutations) => {
            // 如果已经有待处理的更新，跳过
            if (pendingUpdate) return;

            // 使用 requestAnimationFrame 确保流畅更新
            pendingUpdate = true;
            requestAnimationFrame(processUpdate);
        });

        observer.observe(container, {
            childList: true,
            subtree: true,
            characterData: true
        });

        console.log('[ChatGPT Adapter] Started observing responses');
        return observer;
    }

    /**
     * 停止监听
     * @param {MutationObserver} observer
     */
    stopObserving(observer) {
        if (observer) {
            observer.disconnect();
            console.log('[ChatGPT Adapter] Stopped observing');
        }
    }
}

// 注册适配器
if (typeof window !== 'undefined') {
    window.ChatGPTAdapter = ChatGPTAdapter;
    window.currentAdapter = new ChatGPTAdapter();
}
