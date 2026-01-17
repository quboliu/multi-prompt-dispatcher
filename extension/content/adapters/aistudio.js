/**
 * Google AI Studio 适配器
 * 支持 aistudio.google.com
 */
class AIStudioAdapter extends BaseAdapter {
    constructor() {
        super();
        this.name = 'aistudio';
        this.displayName = 'Google AI Studio';
        this.icon = '🛠️';
    }

    detect() {
        return window.location.hostname === 'aistudio.google.com';
    }

    isReady() {
        if (!this.detect()) return false;

        const input = this.getInputElement();
        const sendBtn = this.getSendButton();

        // 检查是否正在生成
        if (this.isGenerating()) return false;

        return !!(input && sendBtn);
    }

    getInputElement() {
        const selectors = [
            'textarea[aria-label="Enter a prompt"]',
            '.cdk-textarea-autosize.textarea',
            'textarea[placeholder*="Start typing"]',
            'textarea[aria-label*="prompt"]',
            'textarea[placeholder*="Type"]',
            '.prompt-input textarea'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }

        return null;
    }

    getSendButton() {
        const selectors = [
            'button[aria-label="Run"]',
            '.run-button',
            'button.primary-button'
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (button && !button.disabled) return button;
        }

        // 备用：查找包含 "Run" 文本的按钮
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            if (btn.textContent.includes('Run') && (btn.classList.contains('ms-button-primary') || btn.classList.contains('run-button'))) {
                return btn;
            }
        }

        return null;
    }

    setPrompt(prompt) {
        const input = this.getInputElement();
        if (!input) return false;

        if (input.tagName === 'TEXTAREA') {
            input.value = prompt;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            // AI Studio (Angular) 特需的同步触发
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            input.focus();
        } else if (input.contentEditable === 'true') {
            input.focus();
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

        return true;
    }

    async sendPrompt(prompt) {
        try {
            if (!this.isReady()) {
                return { success: false, error: '页面未就绪，可能正在生成回答' };
            }

            if (!this.setPrompt(prompt)) {
                return { success: false, error: '无法设置输入内容' };
            }

            await this.delay(300);

            let sendBtn = this.getSendButton();
            if (!sendBtn) {
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

    startObserving(onUpdate) {
        let lastText = '';
        let timeoutId = null;

        const observer = new MutationObserver(() => {
            if (timeoutId) clearTimeout(timeoutId);

            timeoutId = setTimeout(() => {
                timeoutId = null;
                const response = this.extractLatestResponse();
                if (!response) return;

                if (response.content && response.content !== lastText) {
                    lastText = response.content;
                    onUpdate(response);
                }
            }, 50);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        console.log('[AI Studio Adapter] Started observing');
        return observer;
    }

    stopObserving(observer) {
        if (observer) {
            observer.disconnect();
            console.log('[AI Studio Adapter] Stopped observing');
        }
    }

    extractLatestResponse() {
        const responseElements = document.querySelectorAll('ms-chat-breakpoint, .model-response, ms-prompt-editor .output-content, .response-content');
        if (responseElements.length === 0) return null;

        const lastResponse = responseElements[responseElements.length - 1];
        const content = lastResponse.innerText.trim();

        return {
            content: content,
            isGenerating: this.isGenerating(),
            role: 'assistant',
            timestamp: Date.now()
        };
    }

    isGenerating() {
        const indicators = [
            'mat-progress-bar',
            '.generating-text',
            '[aria-label="Stop generating"]',
            'button[aria-label="Stop"]',
            '.run-button.stop',
            '.loading-indicator'
        ];

        for (const selector of indicators) {
            if (document.querySelector(selector)) return true;
        }

        return false;
    }
}

// 注册适配器
if (typeof window !== 'undefined') {
    window.AIStudioAdapter = AIStudioAdapter;
    window.currentAdapter = new AIStudioAdapter();
}
