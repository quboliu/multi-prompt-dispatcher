/**
 * Gemini 适配器
 * 支持 gemini.google.com 和 aistudio.google.com
 */
class GeminiAdapter extends BaseAdapter {
    constructor() {
        super();
        this.name = 'gemini';
        this.displayName = 'Gemini';
        this.icon = '💙';
    }

    detect() {
        const hostname = window.location.hostname;
        return hostname === 'gemini.google.com' || hostname === 'aistudio.google.com';
    }

    isReady() {
        if (!this.detect()) return false;

        const input = this.getInputElement();
        const sendBtn = this.getSendButton();

        // 检查是否正在生成
        const loadingIndicator = document.querySelector('.loading-indicator, [data-loading="true"]');
        if (loadingIndicator) return false;

        return !!(input && sendBtn);
    }

    getInputElement() {
        const hostname = window.location.hostname;

        if (hostname === 'gemini.google.com') {
            // Gemini 主站点
            const selectors = [
                'rich-textarea .ql-editor',
                'rich-textarea div[contenteditable="true"]',
                '.input-area-container textarea',
                'div[contenteditable="true"][aria-label*="prompt"]',
                'div[contenteditable="true"][data-placeholder]',
                '.text-input-field textarea',
                'textarea[placeholder*="Enter"]'
            ];

            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) return element;
            }
        } else if (hostname === 'aistudio.google.com') {
            // AI Studio
            const selectors = [
                'textarea[aria-label*="prompt"]',
                'textarea[placeholder*="Type"]',
                '.prompt-input textarea',
                'div[contenteditable="true"]'
            ];

            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) return element;
            }
        }

        return null;
    }

    getSendButton() {
        const hostname = window.location.hostname;

        if (hostname === 'gemini.google.com') {
            // Gemini 主站点发送按钮
            const selectors = [
                'button[aria-label="Send message"]',
                'button[aria-label*="Submit"]',
                '.send-button',
                'button.send-button',
                'mat-icon-button[aria-label*="Send"]',
                'button[data-test-id="send-button"]'
            ];

            for (const selector of selectors) {
                const button = document.querySelector(selector);
                if (button && !button.disabled) return button;
            }

            // 备用：查找输入区域附近的发送按钮
            const inputArea = document.querySelector('.input-area, .input-area-container');
            if (inputArea) {
                const buttons = inputArea.querySelectorAll('button');
                for (const btn of buttons) {
                    if (btn.querySelector('svg') || btn.querySelector('mat-icon')) {
                        return btn;
                    }
                }
            }
        } else if (hostname === 'aistudio.google.com') {
            // AI Studio 发送按钮
            const selectors = [
                'button[aria-label="Run"]',
                'button[aria-label="Send"]',
                '.run-button',
                'button.primary-button'
            ];

            for (const selector of selectors) {
                const button = document.querySelector(selector);
                if (button && !button.disabled) return button;
            }
        }

        return null;
    }

    setPrompt(prompt) {
        const input = this.getInputElement();
        if (!input) return false;

        if (input.tagName === 'TEXTAREA') {
            // 标准 textarea
            input.value = prompt;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (input.classList.contains('ql-editor')) {
            // Quill 编辑器（Gemini 使用）
            input.innerHTML = `<p>${prompt}</p>`;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (input.contentEditable === 'true') {
            // 通用 contenteditable
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

            // 设置内容
            if (!this.setPrompt(prompt)) {
                return { success: false, error: '无法设置输入内容' };
            }

            // 等待 UI 响应（Gemini 可能需要更长时间）
            await this.delay(300);

            // 获取发送按钮
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
}

// 注册适配器
if (typeof window !== 'undefined') {
    window.GeminiAdapter = GeminiAdapter;
    window.currentAdapter = new GeminiAdapter();
}
