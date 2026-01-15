# Multi-LLM Prompt Dispatcher

🚀 **一次输入，多模型网页端并行发送 Prompt**

一款 Chrome 浏览器扩展，让你可以同时向多个 AI 模型（ChatGPT、Claude、Gemini）发送相同的 Prompt，告别重复复制粘贴。

## ✨ 功能特性

### Phase 1（当前版本）

- ✅ **统一 Prompt 输入** - 在一个界面输入，发送到多个模型
- ✅ **自动检测 LLM 页面** - 自动识别已打开的 ChatGPT、Claude、Gemini 页面
- ✅ **多模型并行发送** - 同时向所有选中的模型发送 Prompt
- ✅ **灵活选择目标** - 可以选择发送到部分模型
- ✅ **发送状态反馈** - 实时显示每个模型的发送结果

### 支持的平台

| 平台 | 支持域名 | 状态 |
|------|---------|------|
| 💚 ChatGPT | `chat.openai.com`, `chatgpt.com` | ✅ 支持 |
| 🧡 Claude | `claude.ai` | ✅ 支持 |
| 💙 Gemini | `gemini.google.com`, `aistudio.google.com` | ✅ 支持 |

## 📦 安装方法

### 方法一：开发者模式加载（推荐）

1. **下载/克隆项目**
   ```bash
   git clone https://github.com/your-repo/MultiPromptDispatcher.git
   # 或直接下载 ZIP 并解压
   ```

2. **打开 Chrome 扩展管理页**
   - 在地址栏输入 `chrome://extensions/`
   - 或通过菜单：设置 → 扩展程序

3. **开启开发者模式**
   - 页面右上角，打开「开发者模式」开关

4. **加载扩展**
   - 点击「加载已解压的扩展程序」
   - 选择项目中的 `extension` 文件夹
   - 即 `/path/to/MultiPromptDispatcher/extension`

5. **完成！**
   - 扩展图标会出现在浏览器工具栏
   - 如果没看到，点击拼图图标 🧩 将其固定

## 🎯 使用方法

### 基本使用流程

1. **打开 LLM 页面**
   - 在不同标签页打开需要使用的 AI 模型网页
   - 确保已登录各平台账号

2. **点击插件图标**
   - 点击浏览器工具栏中的插件图标 🚀
   - 插件会自动扫描并显示已打开的 LLM 页面

3. **选择目标模型**
   - 默认选中所有检测到的模型
   - 点击取消选择不需要的模型
   - 绿色圆点表示页面已就绪，红色表示可能正在生成中

4. **输入 Prompt**
   - 在文本框中输入你的 Prompt

5. **发送**
   - 点击「发送到 N 个模型」按钮
   - 插件会并行发送到所有选中的模型
   - 查看发送结果反馈

### 使用场景示例

#### 场景一：首次统一提问
```
1. 打开 ChatGPT、Claude、Gemini 三个标签页
2. 点击插件，输入：「请解释什么是 RAG 技术」
3. 点击发送，三个模型同时开始生成回答
```

#### 场景二：多轮统一追问
```
1. 第一轮：发送「请解释什么是 RAG」
2. 查看各模型回答
3. 第二轮：发送「能给一个具体的代码示例吗？」
4. 每个模型会基于各自的上下文继续对话
```

#### 场景三：混合使用
```
1. 统一发送问题
2. 单独与 Claude 深聊几轮
3. 回到插件，发送新的统一问题
   （每个模型使用各自当前的对话上下文）
```

## 🏗️ 技术架构

### 目录结构

```
extension/
├── manifest.json          # 扩展配置文件
├── background/
│   └── background.js      # Service Worker（后台逻辑）
├── content/
│   ├── adapters/
│   │   ├── base.js       # 适配器基类
│   │   ├── chatgpt.js    # ChatGPT 适配器
│   │   ├── claude.js     # Claude 适配器
│   │   └── gemini.js     # Gemini 适配器
│   └── content.js        # Content Script 主入口
├── popup/
│   ├── popup.html        # 弹窗页面
│   ├── popup.css         # 弹窗样式
│   └── popup.js          # 弹窗逻辑
└── icons/                # 扩展图标
```

### 架构图

```
┌──────────────────────────────┐
│ Popup UI                     │  用户输入 Prompt
│ (popup.html/js/css)          │  选择目标模型
└──────────────┬───────────────┘
               │ chrome.runtime.sendMessage
┌──────────────▼───────────────┐
│ Background Service Worker    │  扫描标签页
│ (background.js)              │  协调消息传递
└──────────────┬───────────────┘
               │ chrome.tabs.sendMessage
┌──────────────▼───────────────┐
│ Content Scripts              │  DOM 检测
│ (Adapter + content.js)       │  填充输入框
│ [ChatGPT][Claude][Gemini]    │  触发发送
└──────────────┬───────────────┘
               │ DOM 操作
┌──────────────▼───────────────┐
│ LLM Web Pages                │  正常的网页交互
│ (已登录的官方页面)             │
└──────────────────────────────┘
```

### 适配器设计

每个平台有独立的适配器，继承自 `BaseAdapter`：

```typescript
interface ModelAdapter {
  name: string;           // 唯一标识
  displayName: string;    // 显示名称
  icon: string;           // 图标 emoji
  
  detect(): boolean;      // 检测是否匹配当前页面
  isReady(): boolean;     // 检测页面是否可发送
  getInputElement();      // 获取输入框元素
  getSendButton();        // 获取发送按钮
  setPrompt(prompt);      // 设置输入内容
  sendPrompt(prompt);     // 完整发送流程
}
```

## ⚠️ 重要说明

### 设计哲学

> **统一的是「发送动作」，不是「上下文状态」**

- 每个模型保持各自独立的对话上下文
- 插件不会同步或合并不同模型的对话历史
- 你可以单独与某个模型深聊后，再使用统一发送

### 已知限制

1. **DOM 依赖** - 依赖各平台的 DOM 结构，平台 UI 更新可能导致适配器失效
2. **无结果视图** - Phase 1 不支持在插件内查看回答（需切换到各模型页面）
3. **无重试机制** - 发送失败需要手动重试

### 安全说明

- ✅ 不访问任何 API 或 Token
- ✅ 不存储任何对话内容
- ✅ 不修改对话上下文
- ✅ 仅模拟正常的用户输入操作

## 🔧 故障排除

### 问题：未检测到 LLM 页面

**可能原因：**
- 页面未完全加载
- 页面 URL 不匹配

**解决方法：**
- 刷新 LLM 页面后重试
- 点击插件中的刷新按钮 🔄

### 问题：发送失败

**可能原因：**
- 模型正在生成回答
- 输入框被禁用
- DOM 结构变化

**解决方法：**
- 等待模型生成完成
- 手动刷新页面
- 如持续失败，可能需要更新适配器

### 问题：发送成功但内容未出现

**可能原因：**
- 发送按钮触发不完整

**解决方法：**
- 切换到对应页面检查
- 尝试手动点击发送按钮

## 📋 开发计划

- [x] **Phase 1** - 多模型统一发送（当前版本）
- [ ] **Phase 2** - 统一只读结果视图
- [ ] **Phase 3** - 对比与认知辅助

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

特别欢迎：
- 新平台适配器
- DOM 选择器更新
- Bug 修复

## 📄 License

MIT License
