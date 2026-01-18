(function () {
    console.log("%c--- AI Studio DOM Inspection ---", "color: #4285f4; font-weight: bold; font-size: 14px;");

    const results = {
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        inputs: [],
        buttons: [],
        potentialResponses: [],
        loadingIndicators: []
    };

    // 1. Check for inputs
    const inputSelectors = [
        'textarea',
        'div[contenteditable="true"]',
        '[role="textbox"]'
    ];
    inputSelectors.forEach(sel => {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
            results.inputs.push({
                selector: sel,
                id: el.id,
                className: el.className,
                placeholder: el.placeholder || el.getAttribute('placeholder'),
                ariaLabel: el.getAttribute('aria-label'),
                isVisible: el.offsetWidth > 0 && el.offsetHeight > 0
            });
        });
    });

    // 2. Check for buttons (Run/Send)
    const buttonSelectors = [
        'button',
        '[role="button"]'
    ];
    buttonSelectors.forEach(sel => {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
            const text = el.innerText || el.textContent || "";
            const ariaLabel = el.getAttribute('aria-label') || "";
            if (/run|send|submit|stop/i.test(text) || /run|send|submit|stop/i.test(ariaLabel)) {
                results.buttons.push({
                    selector: sel,
                    text: text.trim().substring(0, 20),
                    ariaLabel: ariaLabel,
                    className: el.className,
                    disabled: el.disabled
                });
            }
        });
    });

    // 3. Potential Response Containers
    const responseSelectors = [
        '.model-response-text-content',
        '.message-content',
        '.prompt-response',
        '[data-test-id*="response"]'
    ];
    responseSelectors.forEach(sel => {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
            results.potentialResponses.push({
                selector: sel,
                count: els.length
            });
        }
    });

    console.log("Summary:", results);

    // Highlight suspected Input
    const mainInput = document.querySelector('textarea[aria-label*="prompt"], .prompt-input textarea, textarea');
    if (mainInput) {
        console.log("%cFound suspected input:", "color: green", mainInput);
        mainInput.style.border = "2px solid red";
    }

    // Highlight suspected Run Button
    const runBtn = document.querySelector('button[aria-label="Run"], button.run-button, button.primary-button');
    if (runBtn) {
        console.log("%cFound suspected Run button:", "color: green", runBtn);
        runBtn.style.outline = "2px solid blue";
    }

    console.log("%cPlease copy the 'Summary' object printed above and paste it here.", "color: #f4b400; font-weight: bold;");
})();
