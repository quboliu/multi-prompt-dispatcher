/**
 * DeepSeek 适配器
 * 支持 chat.deepseek.com
 */
class DeepSeekAdapter extends BaseAdapter {
    constructor() {
        super();
        this.name = 'deepseek';
        this.displayName = 'DeepSeek';
        this.icon = '🔵';
    }

    detect() {
        return window.location.hostname === 'chat.deepseek.com';
    }

    isReady() {
        if (!this.detect()) {
            console.log('[DeepSeek Adapter] Not on DeepSeek page');
            return false;
        }

        const input = this.getInputElement();

        console.log('[DeepSeek Adapter] isReady check:', {
            hasInput: !!input,
            isGenerating: this.isGenerating()
        });

        // 检查是否正在生成（停止按钮存在）
        if (this.isGenerating()) {
            console.log('[DeepSeek Adapter] Currently generating, not ready');
            return false;
        }

        if (!input) {
            console.log('[DeepSeek Adapter] No input found, not ready');
            return false;
        }

        // DeepSeek 的发送按钮只在有输入内容时才会启用/显示
        // 所以这里不再检查发送按钮，只在实际发送时检查
        // 只要有输入框且没有正在生成，就认为是就绪状态
        console.log('[DeepSeek Adapter] Ready (input found, not generating)');
        return true;
    }

    getInputElement() {
        // DeepSeek 使用 textarea
        const selectors = [
            'textarea[placeholder*="Message"]',
            'textarea[placeholder*="消息"]',
            'textarea[placeholder*="输入"]',
            'textarea:not([disabled])',
            'div[contenteditable="true"][role="textbox"]'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && this.isVisibleElement(element)) {
                return element;
            }
        }

        console.warn('[DeepSeek Adapter] ❌ No input element found');
        return null;
    }

    getSendButton() {
        console.log('[DeepSeek Adapter] Searching for send button...');

        // 需要排除的按钮 class 和关键词
        const excludeClasses = ['ries-floating-button', 'floating-button', 'language-button', 'toggle'];
        const uploadKeywords = ['upload', 'attach', 'file', '上传', '附件', '文件'];

        // 检查按钮是否应该被排除
        const shouldExcludeButton = (btn) => {
            const classes = btn.className || '';
            const text = btn.textContent?.trim() || '';
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();

            // 排除基本类
            if (excludeClasses.some(c => classes.includes(c))) return true;
            if (classes.includes('inactive') || classes.includes('disabled')) return true;
            if (text.includes('En0') || text.includes('中文') || text.includes('English')) return true;

            // 排除上传/附件按钮
            if (uploadKeywords.some(k => ariaLabel.includes(k) || classes.toLowerCase().includes(k))) return true;

            return false;
        };

        // 检查元素是否是上传按钮（有关联的 file input）
        const isUploadButton = (elem) => {
            // 检查元素内部是否有 file input
            const hasFileInput = elem.querySelector('input[type="file"]');
            if (hasFileInput) return true;

            // 检查附近是否有 file input（上传按钮通常会触发 file input）
            const parent = elem.parentElement;
            if (parent) {
                const nearbyFileInput = parent.querySelector('input[type="file"]');
                if (nearbyFileInput) return true;
            }

            // 检查 aria-label 是否包含上传相关词
            const ariaLabel = (elem.getAttribute('aria-label') || '').toLowerCase();
            if (uploadKeywords.some(k => ariaLabel.includes(k))) return true;

            // 检查 SVG 的特征 - 上传图标通常是回形针(clip)或向上箭头(但不是发送箭头)
            const svg = elem.querySelector('svg');
            if (svg) {
                const svgContent = svg.innerHTML.toLowerCase();
                // 回形针图标的特征
                if (svgContent.includes('clip') || svgContent.includes('paperclip')) return true;
            }

            return false;
        };

        // 策略1: 尝试特定选择器
        const specificSelectors = [
            'button[aria-label*="发送"]',
            'button[aria-label*="Send"]',
            '[role="button"][aria-label*="发送"]',
            '[role="button"][aria-label*="Send"]',
            'button.send-button',
            'button[data-testid*="send"]',
            '#chat-input-box button:last-of-type',
            '[class*="send"] button',
            '.chat-input-actions button'
        ];

        for (const selector of specificSelectors) {
            const button = document.querySelector(selector);
            if (button && !button.disabled && this.isVisibleElement(button) &&
                !shouldExcludeButton(button) && !isUploadButton(button)) {
                console.log('[DeepSeek Adapter] ✅ Found send button with selector:', selector, button);
                return button;
            }
        }

        // 策略2: 查找输入框旁边的按钮，取最右边的那个（发送按钮通常在最右侧）
        const input = this.getInputElement();
        if (input) {
            let container = input.parentElement;
            let depth = 0;

            while (container && depth < 6) {
                const clickableElements = container.querySelectorAll('button, [role="button"]');

                // 收集所有有效的候选按钮
                const candidates = [];

                for (const elem of clickableElements) {
                    if (!this.isVisibleElement(elem)) continue;
                    if (elem.disabled || elem.getAttribute('aria-disabled') === 'true') continue;
                    if (shouldExcludeButton(elem)) continue;
                    if (isUploadButton(elem)) {
                        console.log('[DeepSeek Adapter] Skipping upload button:', elem);
                        continue;
                    }

                    const svg = elem.querySelector('svg');
                    if (svg) {
                        const paths = svg.querySelectorAll('path');
                        if (paths.length > 0) {
                            const rect = elem.getBoundingClientRect();
                            candidates.push({ elem, rect });
                        }
                    }
                }

                // 如果找到候选按钮，选择最右边的那个（发送按钮通常在右侧）
                if (candidates.length > 0) {
                    candidates.sort((a, b) => b.rect.right - a.rect.right);
                    const sendBtn = candidates[0].elem;
                    console.log('[DeepSeek Adapter] ✅ Found send button (rightmost):', sendBtn);
                    return sendBtn;
                }

                container = container.parentElement;
                depth++;
            }
        }

        console.warn('[DeepSeek Adapter] ❌ No send button found');
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

        console.log('[DeepSeek Adapter] Setting prompt, length:', prompt.length);

        try {
            // 聚焦输入框
            input.focus();

            if (input.tagName === 'TEXTAREA') {
                // 清空并选中所有内容
                input.select();

                // 主要方法: 使用 document.execCommand
                // 这是最可靠的React兼容方式，因为它模拟真实用户输入
                let inserted = false;
                try {
                    inserted = document.execCommand('insertText', false, prompt);
                } catch (e) {
                    console.log('[DeepSeek Adapter] execCommand failed:', e);
                }

                if (inserted && input.value === prompt) {
                    console.log('[DeepSeek Adapter] ✅ execCommand insertText succeeded');
                } else {
                    // 备选方法: 手动设置 + React workaround
                    console.log('[DeepSeek Adapter] execCommand failed, using React workaround');

                    // 先重置 React 的 value tracker
                    const tracker = input._valueTracker;
                    if (tracker) {
                        tracker.setValue('');
                    }

                    // 使用 native setter
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype,
                        'value'
                    ).set;
                    nativeInputValueSetter.call(input, prompt);

                    // 触发 input 事件
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // 触发 change 事件
                input.dispatchEvent(new Event('change', { bubbles: true }));

                // 确保光标在末尾
                input.setSelectionRange(input.value.length, input.value.length);

            } else if (input.contentEditable === 'true') {
                // ContentEditable 方式
                input.innerHTML = '';
                input.focus();

                let inserted = false;
                try {
                    inserted = document.execCommand('insertText', false, prompt);
                } catch (e) {
                    console.log('[DeepSeek Adapter] execCommand failed for contentEditable:', e);
                }

                if (!inserted) {
                    input.textContent = prompt;
                    input.dispatchEvent(new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        inputType: 'insertText',
                        data: prompt
                    }));
                }
            }

            console.log('[DeepSeek Adapter] Prompt set complete. Value length:', input.value?.length || 0);
            return true;
        } catch (error) {
            console.error('[DeepSeek Adapter] Error setting prompt:', error);
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
                    console.log(`[DeepSeek Adapter] Found send button on attempt ${i + 1}`);
                    break;
                }
                console.log(`[DeepSeek Adapter] Send button not found, attempt ${i + 1}/${maxAttempts}`);
            }

            // 如果找到按钮，尝试点击
            if (sendBtn && !sendBtn.disabled) {
                console.log('[DeepSeek Adapter] Clicking send button');
                sendBtn.click();
                return { success: true };
            }

            // 备选方案：使用 Enter 键发送
            console.log('[DeepSeek Adapter] No send button found, trying Enter key');
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

                // 也尝试按下的 keypress 和 keyup 事件
                input.dispatchEvent(new KeyboardEvent('keypress', {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                }));
                input.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                }));

                console.log('[DeepSeek Adapter] Enter key sent');
                return { success: true };
            }

            return { success: false, error: '无法找到发送按钮，且 Enter 键发送失败' };
        } catch (error) {
            console.error('[DeepSeek Adapter] sendPrompt error:', error);
            return { success: false, error: error.message };
        }
    }

    // ============ Phase 2: 输出捕获功能 ============

    /**
     * 检查是否正在生成
     */
    isGenerating() {
        // 检查停止按钮
        const stopSelectors = [
            'button[aria-label*="停止"]',
            'button[aria-label*="Stop"]',
            'button.stop-button',
            'button svg[class*="stop"]'
        ];

        for (const selector of stopSelectors) {
            const stopBtn = document.querySelector(selector);
            if (stopBtn && this.isVisibleElement(stopBtn)) {
                return true;
            }
        }

        // 检查生成指示器
        const indicators = document.querySelectorAll('.generating, [data-generating="true"], .streaming');
        return indicators.length > 0;
    }

    /**
     * 获取对话消息容器
     */
    getResponseContainer() {
        const selectors = [
            '.chat-messages',
            '.conversation-container',
            '.message-list',
            '[role="log"]',
            'main .messages',
            '.chat-container'
        ];

        for (const selector of selectors) {
            const container = document.querySelector(selector);
            if (container) return container;
        }

        // 备用：查找包含多个消息的容器
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
            const messages = div.querySelectorAll('[class*="message"]');
            if (messages.length >= 2) {
                return div;
            }
        }

        return document.body;
    }

    /**
     * 提取最新的助手回答
     */
    extractLatestResponse() {
        try {
            // 查找所有消息元素
            const messageSelectors = [
                '[data-role="assistant"]',
                '[data-message-role="assistant"]',
                '.message.assistant',
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

            // 如果没找到，尝试通过结构查找
            if (assistantMessages.length === 0) {
                const allMessages = document.querySelectorAll('[class*="message"]');
                assistantMessages = Array.from(allMessages).filter(msg => {
                    const classes = msg.className.toLowerCase();
                    return classes.includes('assistant') ||
                        classes.includes('ai') ||
                        classes.includes('bot');
                });
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
            console.error('[DeepSeek Adapter] Error extracting response:', error);
            return null;
        }
    }

    /**
     * 开始监听输出变化
     */
    startObserving(callback) {
        const container = this.getResponseContainer();
        if (!container) {
            console.error('[DeepSeek Adapter] Response container not found');
            return null;
        }

        let lastContent = '';
        let timeoutId = null;

        const observer = new MutationObserver((mutations) => {
            // 使用短延迟合并多次 DOM 变化
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            timeoutId = setTimeout(() => {
                timeoutId = null;

                const response = this.extractLatestResponse();
                if (!response) return;

                // 仅在内容变化时触发回调
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

        console.log('[DeepSeek Adapter] Started observing responses');
        return observer;
    }

    /**
     * 停止监听
     */
    stopObserving(observer) {
        if (observer) {
            observer.disconnect();
            console.log('[DeepSeek Adapter] Stopped observing');
        }
    }
}

// 注册适配器
if (typeof window !== 'undefined') {
    window.DeepSeekAdapter = DeepSeekAdapter;
    window.currentAdapter = new DeepSeekAdapter();
}
