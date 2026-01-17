/**
 * Doubao (豆包) 适配器
 * 支持 doubao.com
 */
class DoubaoAdapter extends BaseAdapter {
    constructor() {
        super();
        this.name = 'doubao';
        this.displayName = '豆包';
        this.icon = '🟠';
    }

    detect() {
        return window.location.hostname.includes('doubao.com');
    }

    isReady() {
        if (!this.detect()) return false;
        const input = this.getInputElement();
        return !!input && !this.isGenerating();
    }

    getInputElement() {
        // 基于 DOM 分析的精准选择器
        const selectors = [
            'textarea[placeholder*="发消息"]',
            'textarea.semi-input-textarea',
            'textarea[placeholder*="输入“/”"]',
            // 备选
            'textarea[placeholder*="消息"]',
            'textarea[placeholder*="发送"]',
            '.editor-content textarea',
            'textarea:not([disabled])'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (this.isVisibleElement(el) && this.isMainInputArea(el)) {
                    console.log('[Doubao Adapter] ✅ Found input with selector:', selector);
                    return el;
                }
            }
        }

        return this.findFallbackInput();
    }

    /**
     * 检查是否在主输入区
     */
    isMainInputArea(element) {
        // 排除掉小按钮或侧边栏输入
        const rect = element.getBoundingClientRect();
        if (rect.width < 100) return false;

        // 排除对话历史中的
        if (element.closest('.history-container, .message-list, [class*="history"]')) return false;

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
        console.log('[Doubao Adapter] Searching for send button...');

        const input = this.getInputElement();
        if (!input) return null;

        // 策略1: 寻找带图标的 semi-button
        // 豆包很多按钮都是 icon 按钮，可能没有文字
        const buttons = document.querySelectorAll('button, [role="button"], .semi-button');

        for (const btn of buttons) {
            if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') continue;
            if (!this.isVisibleElement(btn)) continue;

            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            const text = (btn.textContent || '').toLowerCase().trim();
            const className = (btn.className || '').toLowerCase();

            // 如果含有发送相关的标签
            if (/发送|确认|submit|send|enter/i.test(ariaLabel + text)) {
                console.log('[Doubao Adapter] ✅ Found send button via label:', ariaLabel || text);
                return btn;
            }

            // 检查是否在输入框附近且包含 SVG (可能是发送图标)
            const rect = btn.getBoundingClientRect();
            const inputRect = input.getBoundingClientRect();

            // 发送按钮通常在输入框的右下角或右侧
            const isPosMatch = rect.left >= inputRect.right - 80 &&
                rect.top >= inputRect.top &&
                rect.bottom <= inputRect.bottom + 50;

            if (isPosMatch && (btn.querySelector('svg') || className.includes('send') || className.includes('primary'))) {
                console.log('[Doubao Adapter] ✅ Found send button near input with icon/class');
                return btn;
            }
        }

        // 策略2: 寻找输入框容器内最后的按钮 (这也是常见模式)
        let container = input.parentElement;
        for (let i = 0; i < 4 && container; i++) {
            const btns = container.querySelectorAll('button, .semi-button');
            if (btns.length > 0) {
                // 通常最后一个按钮是发送
                const lastBtn = btns[btns.length - 1];
                if (!lastBtn.disabled && this.isVisibleElement(lastBtn)) {
                    console.log('[Doubao Adapter] ✅ Found send button as last button in container');
                    return lastBtn;
                }
            }
            container = container.parentElement;
        }

        return null;
    }

    isVisibleElement(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }

    setPrompt(prompt) {
        const input = this.getInputElement();
        if (!input) return false;

        input.focus();

        try {
            if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                input.select();
                const inserted = document.execCommand('insertText', false, prompt);

                if (!inserted) {
                    const tracker = input._valueTracker;
                    if (tracker) tracker.setValue('');

                    const nativeSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype, 'value'
                    ).set;
                    nativeSetter.call(input, prompt);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }

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
            console.error('[Doubao Adapter] setPrompt error:', e);
            return false;
        }
    }

    async sendPrompt(prompt) {
        if (!this.setPrompt(prompt)) return { success: false, error: '无法设置输入内容' };

        await this.delay(200);

        // 优先尝试 Enter
        const input = this.getInputElement();
        if (input) {
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
            });
            input.dispatchEvent(enterEvent);

            await this.delay(100);
            if (this.isInputCleared(input)) return { success: true };
        }

        // 按钮兜底
        const btn = this.getSendButton();
        if (btn) {
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
        // 豆包停止按钮特征
        return !!document.querySelector('button[aria-label*="停止"], .stop-button, [class*="stop"]');
    }

    extractLatestResponse() {
        // 豆包消息容器特征
        const messages = document.querySelectorAll('[class*="message-item"], [class*="response-item"]');
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
        const container = document.querySelector('main, [class*="chat-list"]') || document.body;
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
    window.DoubaoAdapter = DoubaoAdapter;
    window.currentAdapter = new DoubaoAdapter();
}
