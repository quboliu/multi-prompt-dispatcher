/**
 * Phase 2 诊断脚本
 * 在 ChatGPT 页面的控制台中运行此脚本，快速诊断监听功能
 */

(function () {
    console.log('=== Multi-LLM Dispatcher - Phase 2 诊断 ===\n');

    // 1. 检查适配器
    console.log('1️⃣ 检查适配器加载状态:');
    if (typeof window.currentAdapter === 'undefined') {
        console.error('❌ 适配器未加载！');
        console.log('   → 检查扩展是否正确安装');
        console.log('   → 刷新页面 (F5)');
        return;
    } else {
        console.log('✅ 适配器已加载:', window.currentAdapter.displayName);
    }

    const adapter = window.currentAdapter;

    // 2. 检查页面检测
    console.log('\n2️⃣ 检查页面检测:');
    if (adapter.detect()) {
        console.log('✅ 页面匹配:', window.location.hostname);
    } else {
        console.error('❌ 页面不匹配！');
        return;
    }

    // 3. 检查页面就绪状态
    console.log('\n3️⃣ 检查页面就绪状态:');
    const isReady = adapter.isReady();
    console.log(isReady ? '✅ 页面已就绪' : '⚠️ 页面未就绪（可能正在生成）');

    // 4. 检查关键 DOM 元素
    console.log('\n4️⃣ 检查关键 DOM 元素:');

    const input = adapter.getInputElement();
    console.log(input ? '✅ 输入框已找到' : '❌ 输入框未找到', input);

    const sendBtn = adapter.getSendButton();
    console.log(sendBtn ? '✅ 发送按钮已找到' : '❌ 发送按钮未找到', sendBtn);

    const container = adapter.getResponseContainer();
    console.log(container ? '✅ 响应容器已找到' : '❌ 响应容器未找到', container);

    // 5. 检查消息结构
    console.log('\n5️⃣ 检查消息结构:');
    const messageGroups = document.querySelectorAll('[data-message-author-role]');
    console.log(`找到 ${messageGroups.length} 个消息组`);

    if (messageGroups.length > 0) {
        const roles = Array.from(messageGroups).map(m => m.getAttribute('data-message-author-role'));
        console.log('角色分布:', roles);

        const latestAssistant = Array.from(messageGroups).reverse().find(m =>
            m.getAttribute('data-message-author-role') === 'assistant'
        );
        if (latestAssistant) {
            console.log('✅ 找到最新助手消息');
        } else {
            console.log('⚠️ 未找到助手消息（可能还没发送过 Prompt）');
        }
    }

    // 6. 检查监听功能
    console.log('\n6️⃣ 检查监听功能:');
    if (typeof adapter.startObserving === 'function') {
        console.log('✅ 监听功能已实现');
    } else {
        console.error('❌ 监听功能未实现！');
        return;
    }

    if (typeof adapter.extractLatestResponse === 'function') {
        console.log('✅ 提取功能已实现');

        const latest = adapter.extractLatestResponse();
        if (latest) {
            console.log('最新回答预览:', {
                role: latest.role,
                length: latest.content.length,
                isGenerating: latest.isGenerating,
                preview: latest.content.substring(0, 100) + '...'
            });
        } else {
            console.log('⚠️ 暂无回答（可能还没发送过 Prompt）');
        }
    }

    // 7. 测试建议
    console.log('\n📋 测试建议:');
    console.log('1. 如果所有检查都通过，尝试在页面中发送一个 Prompt');
    console.log('2. 打开 Dashboard (Ctrl+Shift+D) 查看实时监听效果');
    console.log('3. 如果有元素未找到，可能是 ChatGPT UI 更新了');
    console.log('   请在 GitHub 提交 Issue 报告选择器失效');

    // 8. 提供快捷测试命令
    console.log('\n🛠️ 快捷测试命令:');
    console.log('手动启动监听：');
    console.log('  window.currentAdapter.startObserving((response) => console.log("响应更新:", response));');
    console.log('\n手动提取回答：');
    console.log('  window.currentAdapter.extractLatestResponse();');
    console.log('\n检查生成状态：');
    console.log('  window.currentAdapter.isGenerating();');

    console.log('\n=== 诊断完成 ===');
})();
