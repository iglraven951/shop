# Frontend Modular Architecture - Quick Reference Guide

## 🚀 Getting Started in 5 Minutes

### Import What You Need

```javascript
// Import from utils (centralized)
import { debounce, throttle, formatCurrency, formatDate } from './utils/index.js';
import { isValidEmail, validateForm } from './utils/validators.js';
import { logger } from './utils/logger.js';

// Import from config
import { Config, ApiEndpoints } from './config.js';

// Import components
import { Button } from './components/Button.js';
import { Toast } from './components/Toast.js';

// Import API client
import { apiClient } from './api-client.js';

// Import app
import { app } from './app.js';
```

---

## 🛠️ Common Tasks

### 1. Make an API Request

```javascript
// Using the centralized API client
const products = await apiClient.getProducts({ category: 'electronics' });
const product = await apiClient.getProductById('product-123');
const result = await apiClient.createOrder(cartItems);

// Handle errors
try {
    await apiClient.loginUser(email, password);
} catch (error) {
    Toast.error(error.message);
    logger.error('Login failed', error);
}
```

### 2. Validate Form Input

```javascript
import { validateForm, hasErrors } from './utils/validators.js';

const schema = {
    email: { required: true, type: 'email' },
    password: { required: true, minLength: 8 },
    phone: { required: false, type: 'phone' }
};

const errors = validateForm(formData, schema);

if (hasErrors(errors)) {
    Toast.error(errors.email || errors.password);
} else {
    // Process form
}
```

### 3. Format Data for Display

```javascript
import { formatCurrency, formatDate, formatFileSize } from './utils/formatters.js';

const price = formatCurrency(99.99, 'USD');           // $99.99
const date = formatDate(new Date(), 'long');          // September 17, 2026
const relativeTime = formatTimeAgo('2026-09-17');     // 2 hours ago
const size = formatFileSize(5242880);                 // 5.00 MB
```

### 4. Log Information (Development)

```javascript
import { logger, LogLevel } from './utils/logger.js';

// Simple logging
logger.info('User logged in');
logger.warn('Deprecated function used');
logger.error('API error', { status: 500 });

// Get logs
const allLogs = logger.getLogs();
const errorLogs = logger.getLogsByLevel(LogLevel.ERROR);
const recentLogs = logger.searchLogs('user login');

// In browser console
window.__logger.getLogs();  // See all logs
window.__logger.downloadLogs('json');  // Download as file
```

### 5. Create a Reusable Component

```javascript
import { Button } from './components/Button.js';
import { Card } from './components/Card.js';

// Create button
const submitBtn = new Button({
    text: 'Submit',
    variant: 'primary',
    size: 'lg',
    onClick: handleSubmit
});

document.getElementById('form').appendChild(submitBtn.render());

// Create card
const card = new Card({
    title: 'Product',
    content: 'Product details...',
    footer: 'Price: $99.99'
});

document.getElementById('container').appendChild(card.render());
```

### 6. Show Notifications

```javascript
import { Toast } from './components/Toast.js';

// Different notification types
Toast.success('Product added to cart!');
Toast.error('Failed to load products');
Toast.warning('This action cannot be undone');
Toast.info('New version available');

// Custom duration
Toast.show('Custom message', 'info', 5000);
```

### 7. Debounce User Input

```javascript
import { debounce } from './utils/helpers.js';

// Debounce search input
const handleSearch = debounce(async (query) => {
    const results = await apiClient.searchProducts(query);
    renderResults(results);
}, 300);

searchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
});
```

### 8. Store Data Safely

```javascript
import { Storage } from './utils/helpers.js';

// Save user preferences
Storage.set('userPreferences', {
    theme: 'dark',
    language: 'es',
    pageSize: 20
});

// Retrieve later
const prefs = Storage.get('userPreferences', {});

// Remove specific key
Storage.remove('userPreferences');

// Clear all
Storage.clear();
```

### 9. Get Configuration Values

```javascript
import { Config, ApiEndpoints, UiConfig } from './config.js';

// API URLs
const baseUrl = Config.getApiBaseUrl();
const endpointUrl = Config.getEndpointUrl('/api/products');

// Endpoints
const searchUrl = ApiEndpoints.products.search;
const chatUrl = ApiEndpoints.chat.messages('conversation-123');

// UI config
const toastDuration = UiConfig.toast.duration;
const pageSize = UiConfig.pagination.defaultPageSize;

// Debugging
Config.logEnvironmentInfo();  // Log setup info
```

### 10. Add Event Listener with Auto-Cleanup

```javascript
import { on } from './utils/helpers.js';

// Event listener is automatically cleaned up
const removeListener = on(button, 'click', (e) => {
    console.log('Button clicked');
});

// Remove listener when done
removeListener();
```

---

## 📋 Module Reference

### Helpers (`helpers.js`)
```javascript
debounce(fn, delay)           // Limit function calls
throttle(fn, limit)           // Rate limit calls
deepClone(obj)                // Deep copy object
isEmpty(obj)                  // Check if object empty
formatCurrency(amount)        // Format money
formatDate(date, format)      // Format date
truncate(text, length)        // Shorten text
generateId()                  // Create unique ID
parseQueryString(qs)          // Parse URL params
buildUrl(baseUrl, params)     // Build URL with params
Storage.set/get/remove        // JSON storage
withTimeout(promise, ms)      // Promise with timeout
retry(fn, attempts, delay)    // Retry function
isInViewport(element)         // Check visibility
scrollToElement(element)      // Scroll smoothly
on(element, event, handler)   // Attach listener
```

### Validators (`validators.js`)
```javascript
isValidEmail(email)           // Email format
validatePassword(pwd)         // Password strength
isValidUsername(user)         // Username format
isValidUrl(url)              // URL format
isValidPhone(phone, country) // Phone number
isValidLength(text, min, max) // String length
isValidPrice(price)          // Price validation
isValidQuantity(qty)         // Quantity validation
sanitizeInput(text)          // Remove XSS
validateForm(data, schema)   // Validate form object
```

### Formatters (`formatters.js`)
```javascript
formatMoney(amount, currency) // Currency
formatNumber(num, decimals)   // Number with separators
formatPercent(value, decimals) // Percentage
formatDate(date, format)      // Date string
formatTimeAgo(date)          // "2 hours ago"
formatFileSize(bytes)        // "5.2 MB"
formatTitle(text)            // Title Case
formatSlug(text)             // url-friendly-slug
formatPhone(phone)           // (123) 456-7890
formatEmail(email, maxLen)   // Truncated email
formatAddress(addr)          // Full address
formatStars(rating)          // ★★★★☆
getCurrencySymbol(code)      // Get $ € £ etc
```

### Logger (`logger.js`)
```javascript
logger.debug(msg, data)      // Debug level
logger.info(msg, data)       // Info level
logger.warn(msg, data)       // Warning level
logger.error(msg, data)      // Error level
logger.critical(msg, data)   // Critical level
logger.getLogs()             // All logs
logger.getLogsByLevel(lvl)   // Filter by level
logger.searchLogs(query)     // Search logs
logger.clearLogs()           // Delete all
logger.downloadLogs('json')  // Export and download
logger.createTimer(label)    // Performance timer
```

### Config (`config.js`)
```javascript
Config.getApiBaseUrl()       // API base URL
Config.getEndpointUrl(ep)   // Full endpoint URL
Config.fetch(endpoint, opts) // Fetch with auth
Config.getUser()             // Current user
Config.setUser(user)         // Save user data
Config.isAuthenticated()     // Check auth status
Config.getEnvironmentInfo()  // Debug info

// Direct access
ApiEndpoints.products.list
ApiEndpoints.products.search
ApiEndpoints.cart.add
ApiEndpoints.chat.messages(id)
ApiEndpoints.users.profile
```

---

## 🎨 Component Usage Examples

### Button Component
```javascript
const button = new Button({
    text: 'Save',
    variant: 'primary',  // primary, secondary, danger
    size: 'md',          // sm, md, lg
    onClick: () => save()
});

element.appendChild(button.render());
```

### Card Component
```javascript
const card = new Card({
    title: 'My Card',
    content: '<p>Card content here</p>',
    footer: 'Optional footer',
    variant: 'default'
});

element.appendChild(card.render());
```

### Modal Component
```javascript
const modal = new Modal({
    title: 'Confirm Action',
    content: 'Are you sure?',
    actions: [
        { label: 'Cancel', onClick: () => modal.close() },
        { label: 'Confirm', onClick: () => handleConfirm() }
    ]
});

modal.open();
```

### Toast Notifications
```javascript
Toast.success('Saved!');
Toast.error('Failed to save');
Toast.warning('This will be deleted');
Toast.info('New data available');
```

---

## 🔍 Debugging Tips

### Enable Verbose Logging
```javascript
// In browser console
window.__logger.config.setLevel(0);  // DEBUG level
window.__logger.getLogs();           // View all logs
```

### Access Configuration
```javascript
// In browser console
window.__config              // Full config object
window.__endpoints          // All API endpoints
window.__featureFlags       // Feature toggles
```

### Performance Measurement
```javascript
const timer = logger.createTimer('Data Loading');
// ... do some work ...
const duration = timer.end();  // Logs and returns duration
```

---

## ⚠️ Common Mistakes to Avoid

```javascript
// ❌ DON'T - Fetching without config
fetch('/api/products')

// ✅ DO - Use centralized API client
apiClient.getProducts()

// ❌ DON'T - Storing sensitive data
Storage.set('password', userPassword)

// ✅ DO - Only store non-sensitive data
Storage.set('user', { id, name, role })

// ❌ DON'T - Logging user passwords
logger.info('Login attempt', { password: pwd })

// ✅ DO - Log without sensitive data
logger.info('Login attempt', { email, success: true })

// ❌ DON'T - Trusting user input directly
element.innerHTML = userInput

// ✅ DO - Use sanitizeInput
element.textContent = sanitizeInput(userInput)

// ❌ DON'T - Creating duplicate code
// Copy-pasting validation logic

// ✅ DO - Use shared validators
if (!isValidEmail(email)) { ... }
```

---

## 📚 Full Documentation

See `.claude/architecture/FRONTEND.md` for complete documentation including:
- Detailed module descriptions
- Architecture patterns
- CSS organization
- Performance optimization
- Security guidelines
- Best practices
- Roadmap

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Module not found | Check import path, use `./` for relative imports |
| API request fails | Check `Config.getApiBaseUrl()`, verify endpoint URL |
| Validation not working | Use `validateForm()` for forms, or specific validators |
| Component not rendering | Call `.render()` to get DOM element, append to DOM |
| Logs not saving | Check `logger.config.setUseStorage(true)` |
| Performance slow | Use `debounce()` for frequent events, check pagination |
| Notifications not showing | Import `Toast` from components, use `Toast.show()` |

---

## 💡 Pro Tips

1. **Use debounce for search**: Prevents excessive API calls
2. **Use validateForm for all forms**: Consistent validation
3. **Use Storage for user preferences**: Persists across sessions
4. **Use logger.createTimer() for metrics**: Built-in performance tracking
5. **Use components instead of HTML**: Consistent styling and behavior
6. **Cache API responses**: Use apiClient's built-in caching
7. **Batch DOM updates**: Use `batchUpdate()` for performance
8. **Handle errors gracefully**: Always use try/catch with API calls

---

**Last Updated**: 2026-09-17
**Version**: 1.0
**Status**: Production Ready
