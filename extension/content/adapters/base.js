/**
 * Base Adapter 接口定义
 * 所有平台适配器必须继承此基类
 */
class BaseAdapter {
    constructor() {
        this.name = 'base';
        this.displayName = 'Base';
        this.icon = '🤖';
    }

    /**
     * 检测当前页面是否为该平台
     * @returns {boolean}
     */
    detect() {
        return false;
    }

    /**
     * 检测页面是否已就绪（可以发送消息）
     * @returns {boolean}
     */
    isReady() {
        return false;
    }

    /**
     * 获取输入框元素
     * @returns {HTMLElement|null}
     */
    getInputElement() {
        return null;
    }

    /**
     * 获取发送按钮元素
     * @returns {HTMLElement|null}
     */
    getSendButton() {
        return null;
    }

    /**
     * 设置输入框内容
     * @param {string} prompt 
     * @returns {boolean}
     */
    setPrompt(prompt) {
        const input = this.getInputElement();
        if (!input) return false;

        // 尝试多种方式设置内容
        if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
            input.value = prompt;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (input.contentEditable === 'true') {
            input.textContent = prompt;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // 对于复杂的富文本编辑器，尝试使用 innerHTML
            input.innerHTML = prompt;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return true;
    }

    /**
     * 点击发送按钮
     * @returns {boolean}
     */
    clickSend() {
        const button = this.getSendButton();
        if (!button) return false;

        button.click();
        return true;
    }

    /**
     * 发送 prompt（完整流程）
     * @param {string} prompt 
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async sendPrompt(prompt) {
        try {
            // 检查页面就绪状态
            if (!this.isReady()) {
                return { success: false, error: '页面未就绪，可能正在生成回答' };
            }

            // 设置 prompt
            if (!this.setPrompt(prompt)) {
                return { success: false, error: '无法设置输入内容' };
            }

            // 等待一小段时间让 UI 响应
            await this.delay(100);

            // 点击发送
            if (!this.clickSend()) {
                return { success: false, error: '无法点击发送按钮' };
            }

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * 工具方法：延迟
     * @param {number} ms 
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 工具方法：等待元素出现
     * @param {string} selector 
     * @param {number} timeout 
     * @returns {Promise<HTMLElement|null>}
     */
    async waitForElement(selector, timeout = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) return element;
            await this.delay(100);
        }
        return null;
    }

    /**
     * 获取适配器状态信息
     * @returns {object}
     */
    getStatus() {
        return {
            name: this.name,
            displayName: this.displayName,
            icon: this.icon,
            detected: this.detect(),
            ready: this.isReady(),
            hasInput: !!this.getInputElement(),
            hasSendButton: !!this.getSendButton()
        };
    }
}

// 全局注册
if (typeof window !== 'undefined') {
    window.BaseAdapter = BaseAdapter;
}
