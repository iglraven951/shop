/**
 * XSS Prevention Utility Library
 *
 * This module provides client-side HTML escaping and sanitization functions
 * to prevent Cross-Site Scripting (XSS) vulnerabilities in the DiscoveryShop frontend.
 */

const Sanitization = (() => {
    'use strict';

    const HTML_ENTITIES = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;'
    };

    function escapeHtml(text) {
        if (!text) return '';
        text = String(text);
        return text.replace(/[&<>"'\/]/g, (char) => HTML_ENTITIES[char]);
    }

    function sanitizeTextContent(text) {
        if (!text) return '';
        text = String(text);
        text = text.replace(/<[^>]*>/g, '');
        return escapeHtml(text);
    }

    function sanitizeAttribute(value) {
        if (!value) return '';
        value = String(value).trim();

        const dangerousProtocols = [
            'javascript:', 'data:', 'vbscript:', 'file:', 'about:'
        ];

        const valueLower = value.toLowerCase();
        for (const protocol of dangerousProtocols) {
            if (valueLower.startsWith(protocol)) {
                return '';
            }
        }

        return escapeHtml(value);
    }

    function sanitizeUrl(url) {
        if (!url) return '';
        url = String(url).trim();

        const dangerousProtocols = [
            'javascript:', 'data:', 'vbscript:', 'file:'
        ];

        const urlLower = url.toLowerCase();
        for (const protocol of dangerousProtocols) {
            if (urlLower.startsWith(protocol)) {
                return '';
            }
        }

        const safeProtocols = ['http://', 'https://', 'mailto:', '/'];

        if (!safeProtocols.some(p => urlLower.startsWith(p))) {
            if (url.startsWith('../') || url.startsWith('./')) {
                return url;
            }
            return '';
        }

        return url;
    }

    function createSafeElement(tagName, textContent = '', attributes = {}) {
        const element = document.createElement(tagName);

        if (textContent) {
            element.textContent = sanitizeTextContent(textContent);
        }

        for (const [key, value] of Object.entries(attributes)) {
            if (key.startsWith('on')) {
                console.warn(`Blocked unsafe attribute: ${key}`);
                continue;
            }

            if (key === 'href' || key === 'src' || key === 'data') {
                element.setAttribute(key, sanitizeUrl(String(value)));
            } else {
                element.setAttribute(key, sanitizeAttribute(String(value)));
            }
        }

        return element;
    }

    function setSafeInnerHTML(element, htmlString) {
        if (!element) return;
        element.textContent = htmlString;
    }

    function buildSafeHTML(template, values = {}) {
        let result = template;

        for (const [key, value] of Object.entries(values)) {
            const placeholder = `{${key}}`;
            const escaped = escapeHtml(String(value));
            result = result.replace(new RegExp(placeholder, 'g'), escaped);
        }

        return result;
    }

    function createMessageElement(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sanitizeAttribute(sender)}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = sanitizeTextContent(text);

        messageDiv.appendChild(contentDiv);
        return messageDiv;
    }

    function isSafeText(text) {
        if (!text) return true;

        text = String(text).toLowerCase();

        const dangerousPatterns = [
            '<script', 'javascript:', 'onerror=', 'onclick=', 'onload=',
            'onmouseover=', 'onfocus=', 'onmouseenter=', 'data:',
            'vbscript:', '<!--', 'eval(', 'expression(', 'behavior:',
            '-moz-binding:', 'iframe', 'embed', 'object'
        ];

        for (const pattern of dangerousPatterns) {
            if (text.includes(pattern)) {
                console.warn(`Detected dangerous pattern: ${pattern}`);
                return false;
            }
        }

        return true;
    }

    function sanitizeUserInput(input, options = {}) {
        if (!input) return '';

        const {
            maxLength = 10000,
            allowNewlines = true,
            trimWhitespace = true
        } = options;

        let text = String(input);

        text = text.replace(/\x00/g, '');

        if (!allowNewlines) {
            text = text.replace(/[\n\r\t]/g, ' ');
        } else {
            text = text.replace(/[\r\t]/g, ' ');
        }

        text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

        if (text.length > maxLength) {
            text = text.substring(0, maxLength);
        }

        if (trimWhitespace) {
            text = text.trim();
        }

        return text;
    }

    function createSafeChatItem(vendor, lastMsg, time) {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';

        chatItem.setAttribute('data-vendor', sanitizeAttribute(vendor));
        chatItem.onclick = () => {
            const vendorName = chatItem.getAttribute('data-vendor');
            if (window.app && typeof window.app.switchChat === 'function') {
                window.app.switchChat(vendorName);
            }
        };

        const vendorNameDiv = document.createElement('div');
        vendorNameDiv.className = 'chat-vendor-name';
        vendorNameDiv.textContent = sanitizeTextContent(vendor);
        chatItem.appendChild(vendorNameDiv);

        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-last-msg';
        msgDiv.textContent = sanitizeTextContent(lastMsg.substring(0, 30)) + '...';
        chatItem.appendChild(msgDiv);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'chat-time';
        timeDiv.textContent = sanitizeTextContent(time);
        chatItem.appendChild(timeDiv);

        return chatItem;
    }

    return {
        escapeHtml,
        sanitizeTextContent,
        sanitizeAttribute,
        sanitizeUrl,
        createSafeElement,
        setSafeInnerHTML,
        buildSafeHTML,
        createMessageElement,
        isSafeText,
        sanitizeUserInput,
        createSafeChatItem
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Sanitization;
}
