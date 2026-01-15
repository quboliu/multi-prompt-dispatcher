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
}

// 注册适配器
if (typeof window !== 'undefined') {
    window.ChatGPTAdapter = ChatGPTAdapter;
    window.currentAdapter = new ChatGPTAdapter();
}
