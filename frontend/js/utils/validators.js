/**
 * Input validators for DiscoveryShop frontend
 * @module utils/validators
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with score and feedback
 */
export function validatePassword(password) {
    const result = {
        isValid: false,
        strength: 'weak',
        feedback: []
    };

    if (password.length < 8) {
        result.feedback.push('Password must be at least 8 characters long');
        return result;
    }

    let score = 0;

    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z\d]/.test(password)) score++;

    if (score < 2) {
        result.feedback.push('Password must contain uppercase, lowercase, numbers, and special characters');
    } else if (score === 2) {
        result.strength = 'weak';
    } else if (score === 3) {
        result.strength = 'medium';
    } else {
        result.strength = 'strong';
    }

    result.isValid = score >= 2;
    return result;
}

/**
 * Validate username format
 * @param {string} username - Username to validate
 * @returns {boolean} True if valid
 */
export function isValidUsername(username) {
    return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
export function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate phone number
 * @param {string} phone - Phone number to validate
 * @param {string} country - Country code (default: ES)
 * @returns {boolean} True if valid
 */
export function isValidPhone(phone, country = 'ES') {
    const patterns = {
        ES: /^(\+34|0034|34)?[6789]\d{8}$/,
        US: /^(\+1|1)?[2-9]\d{2}[2-9](?!1)\d{6}$/,
        MX: /^(\+52)?[0-9]{10}$/
    };

    const pattern = patterns[country] || patterns.ES;
    return pattern.test(phone.replace(/\D/g, ''));
}

/**
 * Validate input length
 * @param {string} input - Input to validate
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @returns {boolean} True if valid
 */
export function isValidLength(input, minLength = 0, maxLength = Infinity) {
    const length = input.trim().length;
    return length >= minLength && length <= maxLength;
}

/**
 * Validate product price
 * @param {number} price - Price to validate
 * @returns {boolean} True if valid
 */
export function isValidPrice(price) {
    return Number.isFinite(price) && price > 0 && price <= 999999.99;
}

/**
 * Validate product quantity
 * @param {number} quantity - Quantity to validate
 * @returns {boolean} True if valid
 */
export function isValidQuantity(quantity) {
    return Number.isInteger(quantity) && quantity > 0 && quantity <= 10000;
}

/**
 * Sanitize text input (remove potential XSS)
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeInput(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Validate file size
 * @param {File} file - File to validate
 * @param {number} maxSizeInMB - Max size in MB
 * @returns {boolean} True if valid
 */
export function isValidFileSize(file, maxSizeInMB = 5) {
    return file.size <= maxSizeInMB * 1024 * 1024;
}

/**
 * Validate file type
 * @param {File} file - File to validate
 * @param {Array<string>} allowedTypes - Allowed MIME types
 * @returns {boolean} True if valid
 */
export function isValidFileType(file, allowedTypes = ['image/jpeg', 'image/png', 'image/gif']) {
    return allowedTypes.includes(file.type);
}

/**
 * Validate credit card number using Luhn algorithm
 * @param {string} cardNumber - Card number (digits only)
 * @returns {boolean} True if valid
 */
export function isValidCreditCard(cardNumber) {
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;

    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits.charAt(i), 10);

        if (isEven) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }

        sum += digit;
        isEven = !isEven;
    }

    return sum % 10 === 0;
}

/**
 * Validate expiration date (MM/YY format)
 * @param {string} expiryDate - Expiry date in MM/YY format
 * @returns {boolean} True if valid
 */
export function isValidExpiryDate(expiryDate) {
    const [month, year] = expiryDate.split('/').map(Number);

    if (!month || !year || month < 1 || month > 12) return false;

    const currentYear = new Date().getFullYear() % 100;
    const currentMonth = new Date().getMonth() + 1;

    // Assuming cards valid for 20 years
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
        return false;
    }

    if (year > currentYear + 20) return false;

    return true;
}

/**
 * Validate CVV/CVC code
 * @param {string} cvv - CVV code
 * @param {string} cardType - Card type (visa, mastercard, amex)
 * @returns {boolean} True if valid
 */
export function isValidCVV(cvv, cardType = 'visa') {
    const cvvDigits = cvv.replace(/\D/g, '');

    // American Express uses 4 digits, others use 3
    if (cardType === 'amex') {
        return cvvDigits.length === 4;
    }

    return cvvDigits.length === 3;
}

/**
 * Validate UUID format
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if valid
 */
export function isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Validate form data object
 * @param {Object} data - Form data to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} Errors object (empty if no errors)
 */
export function validateForm(data, schema) {
    const errors = {};

    Object.entries(schema).forEach(([field, rules]) => {
        const value = data[field];

        if (rules.required && (!value || value.toString().trim() === '')) {
            errors[field] = `${field} is required`;
            return;
        }

        if (value && rules.minLength && value.length < rules.minLength) {
            errors[field] = `${field} must be at least ${rules.minLength} characters`;
        }

        if (value && rules.maxLength && value.length > rules.maxLength) {
            errors[field] = `${field} must not exceed ${rules.maxLength} characters`;
        }

        if (value && rules.type) {
            if (rules.type === 'email' && !isValidEmail(value)) {
                errors[field] = 'Invalid email format';
            } else if (rules.type === 'url' && !isValidUrl(value)) {
                errors[field] = 'Invalid URL format';
            } else if (rules.type === 'number' && isNaN(value)) {
                errors[field] = `${field} must be a number`;
            }
        }

        if (value && rules.custom) {
            const customError = rules.custom(value);
            if (customError) {
                errors[field] = customError;
            }
        }
    });

    return errors;
}

/**
 * Check if form data has errors
 * @param {Object} errors - Errors object from validateForm
 * @returns {boolean} True if there are errors
 */
export function hasErrors(errors) {
    return Object.keys(errors).length > 0;
}

/**
 * Get first error message
 * @param {Object} errors - Errors object from validateForm
 * @returns {string|null} First error message or null
 */
export function getFirstError(errors) {
    const errorMessages = Object.values(errors);
    return errorMessages.length > 0 ? errorMessages[0] : null;
}
