# DeepSeek 适配器开发总结

## 概述

本文档总结了 DeepSeek (chat.deepseek.com) 适配器的开发过程，记录遇到的问题、解决方案以及对未来适配器开发的启示。

---

## 遇到的问题与解决方案

### 问题 1: 发送按钮识别失败

**现象**:
- `getSendButton()` 返回 `null`
- 只找到一个 `ries-floating-button inactive` 按钮（语言切换按钮）

**原因**:
- DeepSeek 的发送按钮使用 `div[role="button"]` 而非 `<button>` 标签
- 发送按钮只在输入框有内容时才启用/显示
- 第三方浮动按钮（语言切换）被错误匹配

**解决方案**:
```javascript
// 扩展选择器，包含 role="button" 的 div
container.querySelectorAll('button, [role="button"]')

// 简化 isReady()，不在此检查发送按钮
isReady() {
    return !!input && !this.isGenerating();
}
```

---

### 问题 2: 点击了错误的按钮（上传按钮）

**现象**:
- 点击后弹出文件选择对话框
- 实际点击的是附件/上传按钮

**原因**:
- 输入区域有多个图标按钮（上传、DeepThink、搜索、发送）
- 都使用 `ds-icon-button` 类，结构相似
- 代码匹配到第一个有 SVG 的按钮

**解决方案**:
```javascript
// 1. 添加上传按钮检测
const isUploadButton = (elem) => {
    // 检查是否有关联的 file input
    if (elem.querySelector('input[type="file"]')) return true;
    if (elem.parentElement?.querySelector('input[type="file"]')) return true;
    // 检查 aria-label
    const ariaLabel = elem.getAttribute('aria-label')?.toLowerCase();
    if (['upload', 'attach', 'file', '上传', '附件'].some(k => ariaLabel?.includes(k))) return true;
    return false;
};

// 2. 选择最右边的按钮（发送按钮通常在最右侧）
candidates.sort((a, b) => b.rect.right - a.rect.right);
return candidates[0].elem;
```

---

### 问题 3: Prompt 设置后 React 状态未更新

**现象**:
- 文本显示在输入框中
- 发送按钮仍显示 "Message is empty"
- 点击输入框后文本消失

**原因**:
- DeepSeek 使用 React 管理输入状态
- 直接设置 `input.value` 不会触发 React 状态更新
- React 的 synthetic event 系统需要特定的事件触发

**解决方案**:
```javascript
setPrompt(prompt) {
    input.focus();
    input.select();
    
    // 主要方法: execCommand 模拟真实用户输入
    const inserted = document.execCommand('insertText', false, prompt);
    
    if (!inserted) {
        // 备选: 重置 React valueTracker 后设置
        const tracker = input._valueTracker;
        if (tracker) tracker.setValue('');
        
        nativeInputValueSetter.call(input, prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
```

---

## DeepSeek 页面 DOM 特点

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 输入框 | `textarea[placeholder*="Message"]` | React 控制的 textarea |
| 发送按钮 | `div.ds-icon-button[role="button"]` | 最右侧，有 SVG 箭头图标 |
| 上传按钮 | `div.ds-icon-button[role="button"]` | 左侧，关联 hidden file input |
| 禁用状态 | `aria-disabled="true"` + `ds-icon-button--disabled` 类 | 无输入时发送按钮禁用 |

---

## 未来适配器开发指南

### 1. DOM 分析清单

在开发新适配器前，先确认以下信息：

- [ ] **输入元素类型**: `<textarea>`, `<input>`, 或 `contenteditable div`?
- [ ] **框架**: React, Vue, 原生 JS?
- [ ] **发送按钮**: `<button>` 或 `div[role="button"]`?
- [ ] **按钮状态**: 如何表示禁用？`disabled` 属性还是 `aria-disabled`?
- [ ] **多按钮区域**: 是否有上传、语音等其他按钮混在一起?
- [ ] **动态显示**: 按钮是否只在有输入时才出现?

### 2. React 应用输入处理

对于 React 应用，推荐的输入设置顺序：

```javascript
// 1. 聚焦
input.focus();

// 2. 选中所有（用于替换）
input.select();

// 3. 使用 execCommand（最可靠）
document.execCommand('insertText', false, text);

// 4. 如果 execCommand 失败，使用 valueTracker 技巧
if (input._valueTracker) {
    input._valueTracker.setValue('');
}
nativeValueSetter.call(input, text);
input.dispatchEvent(new Event('input', { bubbles: true }));
```

### 3. 按钮识别策略

按优先级排序：

1. **aria-label** - 最可靠，如 `aria-label="Send"` 或 `aria-label="发送"`
2. **位置** - 发送按钮通常在输入区域最右侧
3. **排除法** - 排除已知的非发送按钮（上传、语音、表情等）
4. **动态检测** - 设置输入后再查找按钮

### 4. 调试技巧

在控制台运行以下命令快速调试：

```javascript
// 测试输入检测
window.currentAdapter.getInputElement()

// 测试按钮检测
window.currentAdapter.getSendButton()

// 测试整体状态
window.currentAdapter.getStatus()

// 手动测试发送
window.currentAdapter.sendPrompt("test message")
```

---

## 关键经验总结

1. **不要假设按钮是 `<button>`** - 现代 UI 框架常用 `div[role="button"]`

2. **React 输入需要特殊处理** - `execCommand('insertText')` 是最可靠的方式

3. **多按钮场景用位置判断** - 发送按钮通常在最右侧

4. **分离 isReady 和按钮检测** - 动态按钮场景下，isReady 只检查基本条件

5. **添加详细日志** - 便于远程调试用户报告的问题

---

## 相关文件

- 适配器实现: [`deepseek.js`](file:///home/muxunting/JieziSpace/IncubatorLab/MultiPromptDispatcher/extension/content/adapters/deepseek.js)
- 调试指南: [`DEEPSEEK_DEBUG.md`](file:///home/muxunting/JieziSpace/IncubatorLab/MultiPromptDispatcher/DEEPSEEK_DEBUG.md)
