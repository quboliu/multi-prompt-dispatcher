/**
 * Qwen (通义千问) 适配器
 * 支持 tongyi.aliyun.com 和 chat.qwen.ai
 */
class QwenAdapter extends BaseAdapter {
    constructor() {
        super();
        this.name = 'qwen';
        this.displayName = '通义千问';
        this.icon = '💜';
    }

    detect() {
        return window.location.hostname.includes('qwen.ai') ||
            window.location.hostname.includes('tongyi.aliyun.com');
    }

    isReady() {
        if (!this.detect()) return false;
        const input = this.getInputElement();
        return !!input && !this.isGenerating();
    }

    getInputElement() {
        // 基于 DOM 分析的精准选择器
        const selectors = [
            '#chat-input',
            'textarea.chat-input',
            'textarea[placeholder*="How can I help"]',
            'textarea[placeholder*="我能帮您做什么"]',
            'div[contenteditable="true"]',
            'textarea:not([disabled])'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && this.isVisibleElement(el) && this.isMainInputArea(el)) {
                console.log('[Qwen Adapter] ✅ Found input with selector:', selector);
                return el;
            }
        }

        return this.findFallbackInput();
    }

    isMainInputArea(element) {
        const rect = element.getBoundingClientRect();
        if (rect.width < 50 || rect.height < 20) return false;

        // 排除历史记录、工具栏等干扰
        if (element.closest('[class*="history"], [class*="list"], [class*="sidebar"]')) return false;

        return true;
    }

    findFallbackInput() {
        const textareas = document.querySelectorAll('textarea:not([disabled])');
        for (const ta of textareas) {
            if (this.isVisibleElement(ta) && this.isMainInputArea(ta)) return ta;
        }
        return null;
    }

    getSendButton() {
        console.log('[Qwen Adapter] Searching for send button...');

        const input = this.getInputElement();

        // 策略1: 优先寻找 Omni 按钮或 Ant Design 风格的发送按钮
        const selectors = [
            '.omni-button-content-btn',
            'button.ant-btn-primary.ant-btn-circle',
            'button[type="submit"]',
            '.chat-input-toolbar button:last-child'
        ];

        for (const selector of selectors) {
            const btn = document.querySelector(selector);
            if (btn && !btn.disabled && this.isVisibleElement(btn)) {
                console.log('[Qwen Adapter] ✅ Found send button via selector:', selector);
                return btn;
            }
        }

        // 策略2: 寻找输入框附近的 SVG 按钮
        if (input) {
            const inputRect = input.getBoundingClientRect();
            const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
            for (const btn of buttons) {
                const rect = btn.getBoundingClientRect();
                // 发送按钮通常在输入框右侧或右下角
                const isNearInput = rect.right >= inputRect.right - 80 &&
                    rect.bottom <= inputRect.bottom + 100 &&
                    rect.top >= inputRect.top - 20;

                if (isNearInput && !btn.disabled && (btn.querySelector('svg') || btn.className.includes('primary'))) {
                    // 排除掉上传按钮
                    if (btn.className.includes('upload')) continue;

                    console.log('[Qwen Adapter] ✅ Found send button via position/icon');
                    return btn;
                }
            }
        }

        return null;
    }

    isVisibleElement(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    setPrompt(prompt) {
        const input = this.getInputElement();
        if (!input) return false;

        console.log('[Qwen Adapter] Setting prompt, length:', prompt.length);

        try {
            // 聚焦输入框
            input.focus();

            if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                // 清空并选中所有内容
                input.select();

                // 主要方法: 使用 document.execCommand
                // 这是最可靠的React兼容方式，因为它模拟真实用户输入
                let inserted = false;
                try {
                    inserted = document.execCommand('insertText', false, prompt);
                } catch (e) {
                    console.log('[Qwen Adapter] execCommand failed:', e);
                }

                if (inserted && (input.value === prompt || input.value.length >= prompt.length * 0.9)) {
                    console.log('[Qwen Adapter] ✅ execCommand insertText succeeded');
                } else {
                    // 备选方法: 手动设置 + React workaround
                    console.log('[Qwen Adapter] execCommand failed or incomplete, using React workaround');

                    // 先重置 React 的 value tracker
                    const tracker = input._valueTracker;
                    if (tracker) {
                        tracker.setValue('');
                    }

                    // 使用 native setter
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
                        'value'
                    ).set;
                    nativeInputValueSetter.call(input, prompt);

                    // 触发 input 事件
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // 触发 change 事件
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (input.contentEditable === 'true') {
                input.innerHTML = '';
                const inserted = document.execCommand('insertText', false, prompt);
                if (!inserted) {
                    input.textContent = prompt;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
            return true;
        } catch (e) {
            console.error('[Qwen Adapter] setPrompt error:', e);
            return false;
        }
    }

    async sendPrompt(prompt) {
        if (!this.setPrompt(prompt)) return { success: false, error: '无法设置输入内容' };

        await this.delay(500); // 稍微增加一点延迟让 React 反应过来

        // 尝试 Enter
        const input = this.getInputElement();
        if (input) {
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
            });
            input.dispatchEvent(enterEvent);

            await this.delay(200);
            if (this.isInputCleared(input)) {
                console.log('[Qwen Adapter] ✅ Message sent via Enter');
                return { success: true };
            }
        }

        // 按钮点击
        const btn = this.getSendButton();
        if (btn) {
            console.log('[Qwen Adapter] Clicking send button...');
            btn.click();
            return { success: true };
        }

        return { success: false, error: '无法发送消息' };
    }

    isInputCleared(input) {
        const val = input.value || input.textContent || '';
        return val.trim() === '';
    }

    isGenerating() {
        return !!document.querySelector('button[aria-label*="停止"], .stop-button, [class*="stop"]');
    }

    extractLatestResponse() {
        const messages = document.querySelectorAll('[class*="message-item"], [class*="response-item"], .message-wrap');
        if (messages.length === 0) return null;

        const last = messages[messages.length - 1];
        return {
            role: 'assistant',
            content: last.innerText.trim(),
            isGenerating: this.isGenerating(),
            timestamp: Date.now()
        };
    }

    startObserving(callback) {
        const container = document.querySelector('main, [class*="chat-wrap"]') || document.body;
        const observer = new MutationObserver(() => {
            const resp = this.extractLatestResponse();
            if (resp) callback(resp);
        });

        observer.observe(container, { childList: true, subtree: true, characterData: true });
        return observer;
    }

    stopObserving(observer) {
        if (observer) observer.disconnect();
    }
}

if (typeof window !== 'undefined') {
    window.QwenAdapter = QwenAdapter;
    window.currentAdapter = new QwenAdapter();
}
