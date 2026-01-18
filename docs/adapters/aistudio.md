# Google AI Studio 适配器深度技术分析

## 1. 架构特征：纯粹的工程化环境
AI Studio 侧重于开发者体验，其前端环境比 Gemini 更加标准，但也更“干净”。

### 技术栈画像
- **框架**: Angular + Material Design。
- **状态管理**: 极度依赖 Angular 的双向绑定或单向数据流。
- **网络**: 使用标准的 HTTP API (如 `streamGenerateContent`)，不再通过 `batchexecute`。

## 2. 交互核心：穿透 Angular 绑定

### 状态同步的“死角”
- **挑战**: 在 AI Studio 中，直接修改 `textarea.value` 不会触发 Angular 的 `ngModel` 更新。如果直接点击 "Run" 按钮，发送的依然是空内容。
- **关键突破**: **`blur` 事件派发**。
  - **原理**: AI Studio 的 Angular 组件通常在 `blur` (失焦) 时执行最后的模型同步。
  - **实现**: 适配器在设置 `value` 后，除了触发 `input` 和 `change`，必须手动派发一个 `Event('blur')`。

### 发送命令的特殊性
- **分析**: 与其他平台不同，AI Studio 并没有“发送按钮”，而是称为 **"Run"**。
- **探测逻辑**: 适配器不仅搜索 `aria-label="Run"`，还匹配特定 CSS 类名 `.run-button`。之所以要结合两者，是因为当代码执行时，按钮可能呈现为“停止”状态。

## 3. 生成状态监测

### 状态指示器
- **特征**: AI Studio 使用 Material Design 的 `mat-progress-bar`。
- **探测逻辑**: 生成过程中，这个进度条会处于一种 indeterminate (不确定) 状态或循环运动。适配器通过探测该元素的存在性来驱动 Dashboard 的 `isGenerating` 指示灯。

## 4. 网络拦截与 API 分析
AI Studio 的后端报文结构相对于 Gemini 非常清晰：
- **格式**: 标准流式 JSON，类似于 Google Vertex AI 的公开 API。
- **解析位**: `candidates[0].content.parts[0].text`。
- **拦截优势**: 直接拦截 API 使我们的 Dashboard 响应速度远快于页面渲染，这在长文本输出时表现尤为明显。

## 5. 总结与建议
- **稳定性评估**: AI Studio 的 DOM 结构由于是基于 Material 组件库构建的，其选择器相对于 ChatGPT 非常稳定。
- **优化点**: AI Studio 允许调节参数（如 Top-K, Temperature）。目前的适配器专注于 Prompt 发送，未来可以扩展捕获并展示当前使用的模型参数。
