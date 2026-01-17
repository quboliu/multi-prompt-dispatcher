/**
 * Grok 适配器
 * 支持 grok.com 和 grok.x.ai
 * 
 * 技术栈: React + Next.js + TypeScript + Tailwind CSS
 */
class GrokAdapter extends BaseAdapter {
    constructor() {
        super();
        this.name = 'grok';
        this.displayName = 'Grok';
        this.icon = '🤖';
    }

    detect() {
        const hostname = window.location.hostname;
        return hostname === 'grok.com' ||
            hostname === 'grok.x.ai' ||
            hostname === 'x.com';
    }

    isReady() {
        if (!this.detect()) return false;

        const input = this.getInputElement();

        console.log('[Grok Adapter] isReady check:', {
            hasInput: !!input,
            isGenerating: this.isGenerating()
        });

        if (!input) return false;

        // 只检查输入框和生成状态
        if (this.isGenerating()) {
            console.log('[Grok Adapter] Currently generating, not ready');
            return false;
        }

        console.log('[Grok Adapter] Ready');
        return true;
    }

    getInputElement() {
        // 按优先级尝试多种选择器
        const selectors = [
            // Tiptap 编辑器 (Grok 可能使用的)
            'div.tiptap.ProseMirror[contenteditable="true"]',
            'div.tiptap[contenteditable="true"]',
            '.tiptap.ProseMirror',
            'div.ProseMirror[contenteditable="true"]',
            'div[contenteditable="true"].ProseMirror',

            // Textarea 备选 (可能是新版 Grok 使用的)
            'textarea[placeholder*="Ask"]',
            'textarea[placeholder*="ask"]',
            'textarea[placeholder*="Message"]',
            'textarea[placeholder*="message"]',
            'textarea[placeholder*="question"]',
            'textarea[placeholder*="Grok"]',
            'textarea[placeholder*="grok"]',
            'textarea[placeholder*="chat"]',
            'textarea[placeholder*="type"]',
            'textarea[placeholder*="Type"]',

            // 通用 contenteditable
            '[contenteditable="true"][role="textbox"]',
            '[contenteditable="true"][data-placeholder]',
            'div[contenteditable="true"][aria-label*="message"]',
            'div[contenteditable="true"][aria-label*="Message"]',

            // 表单内的 textarea (常见模式)
            'form textarea:not([disabled])',

            // 最后尝试通用 textarea
            'main textarea:not([disabled])',
            'textarea:not([disabled]):not([readonly])'
        ];

        for (const selector of selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    if (this.isVisibleElement(element) && this.isMainInputArea(element)) {
                        console.log('[Grok Adapter] ✅ Found input with selector:', selector);
                        return element;
                    }
                }
            } catch (e) {
                // 选择器语法错误，跳过
            }
        }

        // 回退方案：查找任何可见的输入元素
        const fallbackInput = this.findFallbackInput();
        if (fallbackInput) {
            console.log('[Grok Adapter] ✅ Found input via fallback detection');
            return fallbackInput;
        }

        console.warn('[Grok Adapter] ❌ No input element found');
        this.debugDOMStructure();
        return null;
    }

    /**
     * 检查元素是否在主输入区域（排除模态框、侧边栏等）
     */
    isMainInputArea(element) {
        // 排除模态框中的元素
        const modal = element.closest('[role="dialog"], [aria-modal="true"], .modal');
        if (modal) return false;

        // 排除隐藏的元素
        if (element.closest('[aria-hidden="true"]')) return false;

        // 检查尺寸 - 主输入框通常有一定宽度（但 Grok 的高度可能较小）
        const rect = element.getBoundingClientRect();
        if (rect.width < 50) return false;

        // 不再检查视口位置，因为输入框可能在页面底部
        return true;
    }

    /**
     * 回退方案：查找任何可见的输入元素
     */
    findFallbackInput() {
        // 优先查找 textarea
        const textareas = document.querySelectorAll('textarea:not([disabled]):not([readonly])');
        for (const ta of textareas) {
            if (this.isVisibleElement(ta) && this.isMainInputArea(ta)) {
                return ta;
            }
        }

        // 然后查找 contenteditable
        const editables = document.querySelectorAll('[contenteditable="true"]');
        for (const el of editables) {
            if (this.isVisibleElement(el) && this.isMainInputArea(el)) {
                // 排除工具栏等小元素
                const rect = el.getBoundingClientRect();
                if (rect.width > 200) {
                    return el;
                }
            }
        }

        return null;
    }

    /**
     * 调试：输出当前 DOM 结构信息
     */
    debugDOMStructure() {
        console.log('[Grok Adapter] DOM Debug Info:');
        console.log('  - URL:', window.location.href);
        console.log('  - Textareas:', document.querySelectorAll('textarea').length);
        console.log('  - Contenteditable:', document.querySelectorAll('[contenteditable="true"]').length);
        console.log('  - ProseMirror:', document.querySelectorAll('.ProseMirror').length);
        console.log('  - Tiptap:', document.querySelectorAll('.tiptap').length);

        // 列出所有 textarea 的占位符
        const textareas = document.querySelectorAll('textarea');
        if (textareas.length > 0) {
            console.log('  - Textarea details:');
            textareas.forEach((ta, i) => {
                console.log(`    [${i}]: placeholder="${ta.placeholder}", class="${ta.className}", visible=${this.isVisibleElement(ta)}`);
            });
        }

        // 列出所有 contenteditable 元素
        const editables = document.querySelectorAll('[contenteditable="true"]');
        if (editables.length > 0) {
            console.log('  - Contenteditable details:');
            editables.forEach((el, i) => {
                const rect = el.getBoundingClientRect();
                console.log(`    [${i}]: tag=${el.tagName}, class="${el.className}", size=${rect.width}x${rect.height}, visible=${this.isVisibleElement(el)}`);
            });
        }
    }

    getSendButton() {
        console.log('[Grok Adapter] Searching for send button...');

        const input = this.getInputElement();
        if (!input) {
            console.log('[Grok Adapter] ❌ No input element found');
            return null;
        }

        // 需要排除的按钮关键词
        const excludeKeywords = [
            'model', 'select', 'upload', 'attach', 'file', 'voice', 'microphone',
            'menu', 'settings', 'more', 'copy', 'share', 'download', 'deep', 'think',
            'search', 'web'
        ];

        // 检查按钮是否应该被排除
        const shouldExcludeButton = (btn) => {
            const id = (btn.id || '').toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            const className = (btn.className || '').toLowerCase();
            const text = (btn.textContent || '').toLowerCase().trim();

            // 检查关键词
            for (const keyword of excludeKeywords) {
                if (id.includes(keyword) || ariaLabel.includes(keyword) ||
                    className.includes(keyword) || text.includes(keyword)) {
                    return true;
                }
            }

            // 检查是否有弹出菜单
            if (btn.getAttribute('aria-haspopup')) return true;

            // 检查是否关联文件上传
            if (btn.querySelector('input[type="file"]')) return true;
            const parent = btn.parentElement;
            if (parent && parent.querySelector('input[type="file"]')) return true;

            return false;
        };

        // 策略1: 通过 aria-label 查找发送按钮
        const sendLabels = ['submit', 'send', '发送', '提交', 'ask grok', 'generate'];
        const allButtons = document.querySelectorAll('button, [role="button"]');

        for (const btn of allButtons) {
            if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') continue;
            if (!this.isVisibleElement(btn)) continue;

            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (sendLabels.some(label => ariaLabel.includes(label))) {
                if (!shouldExcludeButton(btn)) {
                    console.log('[Grok Adapter] ✅ Found send button via aria-label:', ariaLabel);
                    return btn;
                }
            }
        }

        // 策略2: 通过 data-testid 查找
        const testIdSelectors = [
            'button[data-testid*="send"]',
            'button[data-testid*="submit"]',
            '[data-testid*="send-button"]',
            '[data-testid*="submit-button"]'
        ];

        for (const selector of testIdSelectors) {
            const button = document.querySelector(selector);
            if (button && !button.disabled && this.isVisibleElement(button) && !shouldExcludeButton(button)) {
                console.log('[Grok Adapter] ✅ Found send button via data-testid:', selector);
                return button;
            }
        }

        // 策略3: 在 form 中查找提交按钮
        const form = input.closest('form') || document.querySelector('form');
        if (form) {
            const formButtons = form.querySelectorAll('button[type="submit"], button:not([type])');
            for (const btn of formButtons) {
                if (!btn.disabled && this.isVisibleElement(btn) && !shouldExcludeButton(btn)) {
                    console.log('[Grok Adapter] ✅ Found send button in form');
                    return btn;
                }
            }
        }

        // 策略4: 查找输入框附近的按钮（基于位置）
        const nearbyButton = this.findButtonNearInput(input, shouldExcludeButton);
        if (nearbyButton) {
            console.log('[Grok Adapter] ✅ Found send button near input');
            return nearbyButton;
        }

        console.warn('[Grok Adapter] ❌ No send button found');
        return null;
    }

    /**
     * 在输入框附近查找发送按钮
     */
    findButtonNearInput(input, shouldExcludeButton) {
        const inputRect = input.getBoundingClientRect();
        const candidates = [];

        let container = input.parentElement;
        let depth = 0;

        while (container && depth < 8) {
            const buttons = container.querySelectorAll('button:not([disabled]), [role="button"]:not([aria-disabled="true"])');

            for (const btn of buttons) {
                if (!this.isVisibleElement(btn)) continue;
                if (shouldExcludeButton(btn)) continue;

                const btnRect = btn.getBoundingClientRect();

                // 按钮应该在输入框右侧或下方
                const isNearby = (
                    // 在右侧
                    (btnRect.left >= inputRect.right - 100 && Math.abs(btnRect.top - inputRect.top) < 50) ||
                    // 在下方
                    (btnRect.top >= inputRect.bottom - 20 && btnRect.top <= inputRect.bottom + 60)
                );

                if (isNearby) {
                    // 检查是否有发送图标（SVG with arrow-like path）
                    const hasSvg = btn.querySelector('svg');
                    candidates.push({
                        btn,
                        rect: btnRect,
                        hasSvg,
                        priority: hasSvg ? 1 : 0
                    });
                }
            }

            if (candidates.length > 0) {
                // 优先选择有 SVG 图标的、最右下角的按钮
                candidates.sort((a, b) => {
                    if (a.priority !== b.priority) return b.priority - a.priority;
                    const bottomDiff = b.rect.bottom - a.rect.bottom;
                    if (Math.abs(bottomDiff) < 20) {
                        return b.rect.right - a.rect.right;
                    }
                    return bottomDiff;
                });
                return candidates[0].btn;
            }

            container = container.parentElement;
            depth++;
        }

        return null;
    }

    /**
     * 检查元素是否可见
     */
    isVisibleElement(element) {
        if (!element) return false;

        // 检查元素是否在 DOM 中
        if (!element.offsetParent && element.tagName !== 'BODY') {
            // 某些情况下 offsetParent 可能为 null 但元素仍可见
            const style = window.getComputedStyle(element);
            if (style.position === 'fixed' || style.position === 'absolute') {
                // 对于 fixed/absolute 定位的元素，使用其他方式检查
            } else {
                const rect = element.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return false;
            }
        }

        const style = window.getComputedStyle(element);
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0';
    }

    setPrompt(prompt) {
        const input = this.getInputElement();
        if (!input) return false;

        console.log('[Grok Adapter] Setting prompt, length:', prompt.length);

        try {
            input.focus();

            if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                // Textarea/Input 方式 - 使用 execCommand
                input.select();

                let inserted = false;
                try {
                    inserted = document.execCommand('insertText', false, prompt);
                } catch (e) {
                    console.log('[Grok Adapter] execCommand failed:', e);
                }

                if (inserted && input.value === prompt) {
                    console.log('[Grok Adapter] ✅ execCommand insertText succeeded');
                } else {
                    // React workaround
                    console.log('[Grok Adapter] Using React workaround');

                    const tracker = input._valueTracker;
                    if (tracker) {
                        tracker.setValue('');
                    }

                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype,
                        'value'
                    )?.set || Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype,
                        'value'
                    )?.set;

                    if (nativeInputValueSetter) {
                        nativeInputValueSetter.call(input, prompt);
                    } else {
                        input.value = prompt;
                    }

                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }

                input.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof input.setSelectionRange === 'function') {
                    input.setSelectionRange(input.value.length, input.value.length);
                }

            } else if (input.contentEditable === 'true') {
                // Contenteditable 方式
                document.execCommand('selectAll', false, null);

                let inserted = false;
                try {
                    inserted = document.execCommand('insertText', false, prompt);
                } catch (e) {
                    console.log('[Grok Adapter] execCommand failed:', e);
                }

                if (!inserted) {
                    input.innerHTML = '';
                    const p = document.createElement('p');
                    p.textContent = prompt;
                    input.appendChild(p);

                    input.dispatchEvent(new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        inputType: 'insertText',
                        data: prompt
                    }));
                }
            }

            console.log('[Grok Adapter] Prompt set complete');
            return true;
        } catch (error) {
            console.error('[Grok Adapter] Error setting prompt:', error);
            return false;
        }
    }

    async sendPrompt(prompt) {
        try {
            if (!this.isReady()) {
                return { success: false, error: '页面未就绪，可能正在生成回答' };
            }

            if (!this.setPrompt(prompt)) {
                return { success: false, error: '无法设置输入内容' };
            }

            // 等待 UI 响应
            await this.delay(200);

            const input = this.getInputElement();

            // 优先尝试 Enter 键发送（更可靠）
            if (input) {
                console.log('[Grok Adapter] Trying Enter key first');
                input.focus();

                const enterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                });

                input.dispatchEvent(enterEvent);
                input.dispatchEvent(new KeyboardEvent('keypress', {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                }));
                input.dispatchEvent(new KeyboardEvent('keyup', {
                    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
                }));

                // 短暂等待检查是否发送成功
                await this.delay(150);

                // 检查输入框是否被清空（表示发送成功）
                const inputAfter = this.getInputElement();
                if (inputAfter) {
                    const content = inputAfter.value || inputAfter.textContent || '';
                    if (content.trim() === '' || content.trim() !== prompt) {
                        console.log('[Grok Adapter] ✅ Message sent via Enter key');
                        return { success: true };
                    }
                }
            }

            // 如果 Enter 键可能没生效，尝试点击按钮
            let sendBtn = null;
            const maxAttempts = 3;

            for (let i = 0; i < maxAttempts; i++) {
                sendBtn = this.getSendButton();
                if (sendBtn && !sendBtn.disabled) {
                    console.log(`[Grok Adapter] Found send button on attempt ${i + 1}`);
                    break;
                }
                await this.delay(100);
            }

            if (sendBtn && !sendBtn.disabled) {
                console.log('[Grok Adapter] Clicking send button');
                sendBtn.click();
                return { success: true };
            }

            // 如果已经发送了 Enter 键，假设成功
            if (input) {
                console.log('[Grok Adapter] Enter key was sent, assuming success');
                return { success: true };
            }

            return { success: false, error: '无法找到发送按钮' };
        } catch (error) {
            console.error('[Grok Adapter] sendPrompt error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 检查是否正在生成
     */
    isGenerating() {
        const stopSelectors = [
            'button[aria-label*="Stop"]',
            'button[aria-label*="stop"]',
            'button[aria-label*="Cancel"]',
            'button[aria-label*="cancel"]',
            '[data-testid*="stop"]'
        ];

        for (const selector of stopSelectors) {
            const stopBtn = document.querySelector(selector);
            if (stopBtn && this.isVisibleElement(stopBtn)) {
                return true;
            }
        }

        const streamingIndicators = document.querySelectorAll(
            '[data-is-streaming="true"], .streaming, [class*="streaming"], [class*="generating"], [class*="loading"]'
        );
        return streamingIndicators.length > 0;
    }

    /**
     * 获取对话消息容器
     */
    getResponseContainer() {
        const selectors = [
            '[data-testid*="conversation"]',
            '.conversation-container',
            '.chat-container',
            '.messages-container',
            'main [role="log"]',
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
            const messageSelectors = [
                '[data-role="assistant"]',
                '[data-message-role="assistant"]',
                '.assistant-message',
                '[class*="assistant"]',
                '[class*="grok-response"]',
                '[class*="ai-message"]',
                '[class*="bot-message"]'
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
            console.error('[Grok Adapter] Error extracting response:', error);
            return null;
        }
    }

    /**
     * 开始监听输出变化
     */
    startObserving(callback) {
        const container = this.getResponseContainer();
        if (!container) {
            console.error('[Grok Adapter] Response container not found');
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

        console.log('[Grok Adapter] Started observing responses');
        return observer;
    }

    /**
     * 停止监听
     */
    stopObserving(observer) {
        if (observer) {
            observer.disconnect();
            console.log('[Grok Adapter] Stopped observing');
        }
    }
}

// 注册适配器
if (typeof window !== 'undefined') {
    window.GrokAdapter = GrokAdapter;
    window.currentAdapter = new GrokAdapter();
}
