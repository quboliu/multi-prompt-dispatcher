/**
 * Claude 适配器
 * 支持 claude.ai
 * 
 * 技术栈: React + ProseMirror (contenteditable)
 */
class ClaudeAdapter extends BaseAdapter {
    constructor() {
        super();
        this.name = 'claude';
        this.displayName = 'Claude';
        this.icon = '🧡';
    }

    detect() {
        return window.location.hostname === 'claude.ai';
    }

    isReady() {
        if (!this.detect()) return false;

        const input = this.getInputElement();

        console.log('[Claude Adapter] isReady check:', {
            hasInput: !!input,
            isGenerating: this.isGenerating()
        });

        if (!input) return false;

        // 只检查输入框和生成状态，不要求发送按钮存在
        // 发送按钮可能只在有输入时才启用
        if (this.isGenerating()) {
            console.log('[Claude Adapter] Currently generating, not ready');
            return false;
        }

        console.log('[Claude Adapter] Ready');
        return true;
    }

    getInputElement() {
        // Claude 使用 ProseMirror 编辑器 (contenteditable div)
        const selectors = [
            'div.ProseMirror[contenteditable="true"]',
            'div[contenteditable="true"][data-placeholder]',
            '[data-placeholder*="Reply to Claude"]',
            '[data-placeholder*="How can Claude help"]',
            'div[contenteditable="true"]'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && this.isVisibleElement(element)) {
                return element;
            }
        }

        console.warn('[Claude Adapter] ❌ No input element found');
        return null;
    }

    getSendButton() {
        console.log('[Claude Adapter] Searching for send button...');

        // 策略1: 通过 aria-label 查找
        const ariaSelectors = [
            'button[aria-label="Send Message"]',
            'button[aria-label="Send message"]',
            'button[aria-label*="Send"]'
        ];

        for (const selector of ariaSelectors) {
            const button = document.querySelector(selector);
            if (button && !button.disabled && this.isVisibleElement(button)) {
                console.log('[Claude Adapter] ✅ Found send button via aria-label:', button);
                return button;
            }
        }

        // 策略2: 通过 data-testid 查找
        const testIdButton = document.querySelector('button[data-testid*="send"]');
        if (testIdButton && !testIdButton.disabled) {
            console.log('[Claude Adapter] ✅ Found send button via data-testid:', testIdButton);
            return testIdButton;
        }

        // 策略3: 在 fieldset 中查找最后一个按钮（Claude UI 结构特点）
        const fieldset = document.querySelector('fieldset');
        if (fieldset) {
            const buttons = fieldset.querySelectorAll('button:not([disabled])');
            if (buttons.length > 0) {
                // 发送按钮通常是最后一个
                const lastBtn = buttons[buttons.length - 1];
                if (lastBtn.querySelector('svg') && this.isVisibleElement(lastBtn)) {
                    console.log('[Claude Adapter] ✅ Found send button in fieldset:', lastBtn);
                    return lastBtn;
                }
            }
        }

        // 策略4: 查找输入框附近的按钮
        const input = this.getInputElement();
        if (input) {
            let container = input.parentElement;
            let depth = 0;

            while (container && depth < 6) {
                const buttons = container.querySelectorAll('button:not([disabled])');

                for (const btn of buttons) {
                    if (!this.isVisibleElement(btn)) continue;

                    // 检查是否有 SVG 图标
                    const svg = btn.querySelector('svg');
                    if (svg) {
                        const rect = btn.getBoundingClientRect();
                        // 发送按钮通常在右侧
                        if (rect.width > 0 && rect.height > 0) {
                            console.log('[Claude Adapter] ✅ Found send button near input:', btn);
                            return btn;
                        }
                    }
                }

                container = container.parentElement;
                depth++;
            }
        }

        console.warn('[Claude Adapter] ❌ No send button found');
        return null;
    }

    /**
     * 检查元素是否可见
     */
    isVisibleElement(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0';
    }

    setPrompt(prompt) {
        const input = this.getInputElement();
        if (!input) return false;

        console.log('[Claude Adapter] Setting prompt, length:', prompt.length);

        try {
            // 聚焦输入框
            input.focus();

            // Claude 使用 ProseMirror (contenteditable)
            // 方法1: 使用 execCommand（最可靠）
            document.execCommand('selectAll', false, null);

            let inserted = false;
            try {
                inserted = document.execCommand('insertText', false, prompt);
            } catch (e) {
                console.log('[Claude Adapter] execCommand failed:', e);
            }

            if (inserted) {
                console.log('[Claude Adapter] ✅ execCommand insertText succeeded');
            } else {
                // 方法2: 直接设置内容（备选）
                console.log('[Claude Adapter] execCommand failed, using innerHTML fallback');

                // 清空并创建段落
                input.innerHTML = '';
                const p = document.createElement('p');
                p.textContent = prompt;
                input.appendChild(p);

                // 触发输入事件
                input.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: prompt
                }));
            }

            // 触发额外事件确保 UI 更新
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

            console.log('[Claude Adapter] Prompt set complete');
            return true;
        } catch (error) {
            console.error('[Claude Adapter] Error setting prompt:', error);
            return false;
        }
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

            // 等待 UI 响应并轮询发送按钮
            let sendBtn = null;
            const maxAttempts = 5;

            for (let i = 0; i < maxAttempts; i++) {
                await this.delay(150);
                sendBtn = this.getSendButton();
                if (sendBtn && !sendBtn.disabled) {
                    console.log(`[Claude Adapter] Found send button on attempt ${i + 1}`);
                    break;
                }
                console.log(`[Claude Adapter] Send button not found/disabled, attempt ${i + 1}/${maxAttempts}`);
            }

            // 如果找到按钮，尝试点击
            if (sendBtn && !sendBtn.disabled) {
                console.log('[Claude Adapter] Clicking send button');
                sendBtn.click();
                return { success: true };
            }

            // 备选方案：使用 Enter 键发送
            console.log('[Claude Adapter] No send button found, trying Enter key');
            const input = this.getInputElement();
            if (input) {
                input.focus();

                // 模拟 Enter 键
                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                });
                input.dispatchEvent(enterEvent);

                // 完整的键盘事件序列
                input.dispatchEvent(new KeyboardEvent('keypress', {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                }));
                input.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                }));

                console.log('[Claude Adapter] Enter key sent');
                return { success: true };
            }

            return { success: false, error: '无法找到发送按钮，且 Enter 键发送失败' };
        } catch (error) {
            console.error('[Claude Adapter] sendPrompt error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 检查是否正在生成
     */
    isGenerating() {
        // 检查停止按钮
        const stopSelectors = [
            'button[aria-label="Stop Response"]',
            'button[aria-label*="Stop"]',
            'button[aria-label*="stop"]'
        ];

        for (const selector of stopSelectors) {
            const stopBtn = document.querySelector(selector);
            if (stopBtn && this.isVisibleElement(stopBtn)) {
                return true;
            }
        }

        // 检查 streaming 状态
        const streamingIndicators = document.querySelectorAll(
            '[data-is-streaming="true"], .streaming, [class*="streaming"]'
        );
        return streamingIndicators.length > 0;
    }

    /**
     * 获取对话消息容器
     */
    getResponseContainer() {
        const selectors = [
            '[data-testid="conversation-turn-wrapper"]',
            '.conversation-container',
            'main [role="presentation"]',
            'main'
        ];

        for (const selector of selectors) {
            const container = document.querySelector(selector);
            if (container) return container;
        }

        return document.body;
    }

    /**
     * 提取最新的助手回答
     */
    extractLatestResponse() {
        try {
            // Claude 的消息结构
            const messageSelectors = [
                '[data-message-author="assistant"]',
                '[data-role="assistant"]',
                '.assistant-message',
                '[class*="assistant"]'
            ];

            let assistantMessages = [];

            for (const selector of messageSelectors) {
                const messages = document.querySelectorAll(selector);
                if (messages.length > 0) {
                    assistantMessages = Array.from(messages);
                    break;
                }
            }

            if (assistantMessages.length === 0) return null;

            // 获取最后一条助手消息
            const lastMessage = assistantMessages[assistantMessages.length - 1];
            const content = lastMessage.innerText || lastMessage.textContent || '';

            return {
                role: 'assistant',
                content: content.trim(),
                isGenerating: this.isGenerating(),
                html: lastMessage.innerHTML,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('[Claude Adapter] Error extracting response:', error);
            return null;
        }
    }

    /**
     * 开始监听输出变化
     */
    startObserving(callback) {
        const container = this.getResponseContainer();
        if (!container) {
            console.error('[Claude Adapter] Response container not found');
            return null;
        }

        let lastContent = '';
        let timeoutId = null;

        const observer = new MutationObserver((mutations) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            timeoutId = setTimeout(() => {
                timeoutId = null;

                const response = this.extractLatestResponse();
                if (!response) return;

                if (response.content !== lastContent) {
                    lastContent = response.content;
                    callback(response);
                }
            }, 0);
        });

        observer.observe(container, {
            childList: true,
            subtree: true,
            characterData: true
        });

        console.log('[Claude Adapter] Started observing responses');
        return observer;
    }

    /**
     * 停止监听
     */
    stopObserving(observer) {
        if (observer) {
            observer.disconnect();
            console.log('[Claude Adapter] Stopped observing');
        }
    }
}

// 注册适配器
if (typeof window !== 'undefined') {
    window.ClaudeAdapter = ClaudeAdapter;
    window.currentAdapter = new ClaudeAdapter();
}
