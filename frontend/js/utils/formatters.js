/**
 * Data formatters for DiscoveryShop frontend
 * @module utils/formatters
 */

/**
 * Format currency value
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: USD)
 * @param {string} locale - Locale (default: es-ES)
 * @returns {string} Formatted currency string
 */
export function formatMoney(amount, currency = 'USD', locale = 'es-ES') {
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    } catch (error) {
        console.warn('Error formatting currency:', error);
        return `${currency} ${amount.toFixed(2)}`;
    }
}

/**
 * Format number with thousands separator
 * @param {number} number - Number to format
 * @param {number} decimals - Number of decimal places
 * @param {string} locale - Locale (default: es-ES)
 * @returns {string} Formatted number
 */
export function formatNumber(number, decimals = 0, locale = 'es-ES') {
    return new Intl.NumberFormat(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(number);
}

/**
 * Format percentage
 * @param {number} value - Value between 0 and 100
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted percentage
 */
export function formatPercent(value, decimals = 1) {
    return `${value.toFixed(decimals)}%`;
}

/**
 * Format date to readable format
 * @param {Date|string} date - Date to format
 * @param {string} format - Format (short, long, full, time, datetime)
 * @param {string} locale - Locale (default: es-ES)
 * @returns {string} Formatted date
 */
export function formatDate(date, format = 'short', locale = 'es-ES') {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    if (!(dateObj instanceof Date) || isNaN(dateObj)) {
        return 'Invalid date';
    }

    const options = {
        short: { year: 'numeric', month: '2-digit', day: '2-digit' },
        long: { year: 'numeric', month: 'long', day: 'numeric' },
        full: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
        time: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
        datetime: {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }
    };

    try {
        return dateObj.toLocaleDateString(locale, options[format] || options.short);
    } catch (error) {
        console.warn('Error formatting date:', error);
        return dateObj.toISOString();
    }
}

/**
 * Format time relative to now (e.g., "2 hours ago")
 * @param {Date|string} date - Date to format
 * @param {string} locale - Locale (default: es-ES)
 * @returns {string} Relative time string
 */
export function formatTimeAgo(date, locale = 'es-ES') {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const seconds = Math.floor((new Date() - dateObj) / 1000);

    const units = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60,
        second: 1
    };

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    for (const [unit, secondsPerUnit] of Object.entries(units)) {
        if (seconds >= secondsPerUnit) {
            const value = Math.floor(seconds / secondsPerUnit);
            return rtf.format(-value, unit);
        }
    }

    return 'just now';
}

/**
 * Format file size
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.floor(Math.log(bytes) / Math.log(k));
    const value = (bytes / Math.pow(k, index)).toFixed(decimals);

    return `${value} ${sizes[index]}`;
}

/**
 * Format text to title case
 * @param {string} text - Text to format
 * @returns {string} Title case text
 */
export function formatTitle(text) {
    return text
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Format text to sentence case
 * @param {string} text - Text to format
 * @returns {string} Sentence case text
 */
export function formatSentence(text) {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Format slug from text
 * @param {string} text - Text to format
 * @returns {string} URL-friendly slug
 */
export function formatSlug(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

/**
 * Format phone number
 * @param {string} phone - Phone number
 * @param {string} format - Format pattern (default: +X (XXX) XXX-XXXX)
 * @returns {string} Formatted phone number
 */
export function formatPhone(phone, format = '+X (XXX) XXX-XXXX') {
    const digits = phone.replace(/\D/g, '');

    if (!digits) return phone;

    // Simple formatting for ES numbers
    if (digits.length === 9) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    }

    // Simple formatting for international numbers
    if (digits.length >= 10) {
        return `+${digits.slice(0, -9)} ${digits.slice(-9, -6)} ${digits.slice(-6, -3)} ${digits.slice(-3)}`.trim();
    }

    return phone;
}

/**
 * Format email (truncate if too long)
 * @param {string} email - Email address
 * @param {number} maxLength - Maximum length
 * @returns {string} Formatted email
 */
export function formatEmail(email, maxLength = 30) {
    if (email.length <= maxLength) return email;

    const [name, domain] = email.split('@');
    const availableLength = maxLength - domain.length - 1;
    const truncatedName = name.substring(0, Math.max(1, availableLength - 3)) + '...';

    return `${truncatedName}@${domain}`;
}

/**
 * Format address
 * @param {Object} address - Address object
 * @returns {string} Formatted address
 */
export function formatAddress(address) {
    const parts = [
        address.street,
        address.city,
        address.state,
        address.zipCode,
        address.country
    ];

    return parts
        .filter(part => part && part.trim())
        .join(', ');
}

/**
 * Format JSON for display
 * @param {Object} obj - Object to format
 * @param {number} indent - Indentation spaces
 * @returns {string} Formatted JSON
 */
export function formatJSON(obj, indent = 2) {
    return JSON.stringify(obj, null, indent);
}

/**
 * Format URL to display (remove protocol, shorten if too long)
 * @param {string} url - URL to format
 * @param {number} maxLength - Maximum display length
 * @returns {string} Formatted URL
 */
export function formatUrl(url, maxLength = 40) {
    try {
        const urlObj = new URL(url);
        let display = urlObj.hostname + (urlObj.pathname === '/' ? '' : urlObj.pathname);

        if (display.length > maxLength) {
            display = display.substring(0, maxLength - 3) + '...';
        }

        return display;
    } catch {
        // If not a valid URL, just truncate
        return url.substring(0, maxLength) + (url.length > maxLength ? '...' : '');
    }
}

/**
 * Format duration (milliseconds to readable format)
 * @param {number} milliseconds - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
}

/**
 * Format text with line breaks
 * @param {string} text - Text with newlines
 * @returns {string} HTML with <br> tags
 */
export function formatLineBreaks(text) {
    return text.replace(/\n/g, '<br>');
}

/**
 * Format currency symbol
 * @param {string} currency - Currency code
 * @returns {string} Currency symbol
 */
export function getCurrencySymbol(currency = 'USD') {
    const symbols = {
        USD: '$',
        EUR: '€',
        GBP: '£',
        JPY: '¥',
        MXN: '$',
        ARS: '$',
        BRL: 'R$',
        CLP: '$',
        COP: '$'
    };

    return symbols[currency] || currency;
}

/**
 * Format rating/stars
 * @param {number} rating - Rating value (0-5)
 * @param {number} maxRating - Max rating (default: 5)
 * @returns {string} Star representation
 */
export function formatStars(rating, maxRating = 5) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    const emptyStars = maxRating - fullStars - (hasHalfStar ? 1 : 0);

    let stars = '★'.repeat(fullStars);
    if (hasHalfStar) stars += '◐';
    stars += '☆'.repeat(emptyStars);

    return stars;
}
