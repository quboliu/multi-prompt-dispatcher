# ChatGPT 适配器深度技术分析

## 1. 核心架构特征
ChatGPT (OpenAI) 的前端架构经历了从早期简单的 `textarea` 到现代基于 **ProseMirror** 的富文本编辑器架构的演进。

### 技术栈画像
- **框架**: Next.js (React)
- **状态管理**: 深度集成 React 状态流，对直接操作私有 DOM 状态有极强的校验机制。
- **渲染引擎**: 动态生成内容，大量使用 Tailwind CSS 进行原子级样式管理。

## 2. 交互难点与应对

### ProseMirror 富文本同步
现代版本的 ChatGPT 消息输入框不再是传统的 `textarea`，而是一个 `contenteditable` 容器。
- **特征**: 简单的 `element.textContent = "..."` 无法触发现端 React 状态的更新，因为编辑器维护着一个内部的文档模型（Document Model）。
- **适配逻辑**: 
  - 适配器在 `setPrompt` 中不仅设置 `innerHTML`，更重要的是派发一个完整的 **`InputEvent`**。
  - `inputType: 'insertText'` 结合 `data: prompt` 是模拟用户真实输入的关键，这能同步触发 ProseMirror 的处理器，进而更新底层 React State。

### 按钮状态流 (State Machine)
发送按钮的选择器 `[data-testid="send-button"]` 虽然稳定，但其 **Enabled/Disabled** 状态切换存在毫秒级的延迟。
- **分析**: 在内容填入后，React 需要时间进行重新渲染以启用按钮。
- **应对**: 适配器在 `sendPrompt` 中引入了 `200ms` 的显式延迟，并在点击前再次轮询按钮状态，防止点击无效。

## 3. 网络层特征 (SSE 深度解析)

### API 与数据格式
- **路径**: `/backend-api/f/conversation` (流式专用)。
- **响应模式**: 标准 SSE (Server-Sent Events)。
- **报文示例**:
  ```text
  data: {"message": {"content": {"parts": ["Hello"]}, "author": {"role": "assistant"}}}
  ```
- **解析挑战**: ChatGPT 的报文包含大量元数据（message_id, conversation_id 等）。`network-interceptor.js` 需要过滤掉用户自己的回显（通过 `author.role` 判定），并准确拼接 `parts` 数组中的内容。

### 防回滚逻辑的必要性
在弱网环境下，SSE 数据流可能出现乱序。拦截器通过 `timestamp` 和 `isGenerating` 状态位确保 Dashboard 显示永远单向递增，避免出现内容“跳变”或“瞬间缩短”的情况。

## 4. DOM 稳定性评估
- **高危点**: 类名（Class Names）是高度动态生成的，如 `mb-1.5` 等。
- **避坑点**: 适配器优先使用 `data-testid` 和 `aria-label`。这些属性作为测试钩子和无障碍标记，其稳定性远高于 CSS 类名。
- **检测逻辑**: `isReady()` 专门针对 `data-testid="stop-button"` 的**存在性**进行判断，这是判定“模型是否处于思考中”最直接的方法。
