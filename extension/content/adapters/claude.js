/**
 * Claude 适配器
 * 支持 claude.ai
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
        const sendBtn = this.getSendButton();

        // 检查是否正在生成（发送按钮可能变成停止按钮）
        const stopButton = document.querySelector('button[aria-label="Stop Response"]');
        if (stopButton) return false;

        return !!(input && sendBtn);
    }

    getInputElement() {
        // Claude 使用 contenteditable div
        const selectors = [
            'div[contenteditable="true"].ProseMirror',
            'div[contenteditable="true"][data-placeholder]',
            'div.ProseMirror[contenteditable="true"]',
            '[data-placeholder="Reply to Claude…"]',
            '[data-placeholder="How can Claude help you today?"]',
            'div[contenteditable="true"]'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }
        return null;
    }

    getSendButton() {
        // Claude 发送按钮选择器
        const selectors = [
            'button[aria-label="Send Message"]',
            'button[aria-label="Send message"]',
            'button[data-testid="send-message"]',
            // 查找带有发送图标的按钮
            'fieldset button[type="button"]:last-of-type',
            'div[data-is-streaming="false"] button'
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (button && !button.disabled) return button;
        }

        // 备用方案：查找包含向上箭头 SVG 的按钮
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const svg = btn.querySelector('svg');
            if (svg && btn.closest('fieldset')) {
                // 检查是否是发送按钮（通常是最后一个按钮）
                const parent = btn.closest('fieldset');
                const allButtons = parent.querySelectorAll('button');
                if (btn === allButtons[allButtons.length - 1]) {
                    return btn;
                }
            }
        }

        return null;
    }

    setPrompt(prompt) {
        const input = this.getInputElement();
        if (!input) return false;

        // Claude 使用 ProseMirror 编辑器
        input.focus();

        // 清空现有内容
        input.innerHTML = '';

        // ProseMirror 格式：创建段落
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

        // 额外触发 keyup 事件以确保 UI 更新
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

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

            // 获取发送按钮
            let sendBtn = this.getSendButton();

            // 如果按钮不可用，再等待一下
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
    window.ClaudeAdapter = ClaudeAdapter;
    window.currentAdapter = new ClaudeAdapter();
}
