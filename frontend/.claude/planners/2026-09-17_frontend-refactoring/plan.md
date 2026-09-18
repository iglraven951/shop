# Plan: Frontend Modular Architecture Refactoring

## Metadata
- **Created**: 2026-09-17
- **Status**: IN_PROGRESS
- **Priority**: CRITICAL
- **Complexity**: LARGE (10+ files)
- **Target**: Convert 2028-line monolithic index.html into professional ES6 modules

## Context
Current state: index.html contains 2028 lines with embedded CSS and JavaScript.
Goal: Extract into clean, reusable, maintainable ES6 modules following SOLID principles.

## Architecture Overview

### Layer 1: Core Infrastructure
```
frontend/
├── index.html              # Clean HTML structure only (< 200 lines)
├── admin.html             # Admin dashboard (separate)
```

### Layer 2: CSS Modules
```
css/
├── modules.css            # Main consolidated CSS
│   ├── Variables & Theme
│   ├── Grid System
│   ├── Base Components
│   ├── Utilities
│   └── Responsive Design
├── chatbot-widget.css     # Chatbot (unchanged)
```

### Layer 3: JavaScript Modules
```
js/
├── config.js              # Configuration & API base (existing)
├── api-client.js          # NEW - Centralized API client
├── app.js                 # NEW - App initialization & orchestration
├── ui.js                  # NEW - DOM utilities & rendering
├── auth.js                # NEW - Authentication management
├── filters.js             # NEW - Product filtering logic
├── chatbot-widget.js      # Chatbot (unchanged)
└── components/            # NEW - Reusable components
    ├── Button.js          # Button component
    ├── Card.js            # Card component
    ├── Modal.js           # Modal component
    └── Toast.js           # Toast notifications
```

## Files to Create/Modify

| Phase | File | Type | Lines | Description |
|-------|------|------|-------|-------------|
| 1 | index.html | Modify | <200 | Clean HTML structure + module imports |
| 1 | css/modules.css | Create | 800 | All CSS from index.html |
| 2 | js/api-client.js | Create | 300 | API endpoint wrapper class |
| 2 | js/auth.js | Create | 250 | Auth/JWT management |
| 2 | js/ui.js | Create | 200 | DOM utilities |
| 2 | js/filters.js | Create | 150 | Product filter logic |
| 2 | js/app.js | Create | 200 | App initialization |
| 3 | js/components/Button.js | Create | 100 | Button component |
| 3 | js/components/Card.js | Create | 100 | Card component |
| 3 | js/components/Modal.js | Create | 120 | Modal component |
| 3 | js/components/Toast.js | Create | 100 | Toast component |

## Architectural Principles

### 1. API Client (api-client.js)
- Centralized all /api/* calls
- JWT token injection
- Error handling & retry logic
- Response caching
- Methods: getProducts(), searchProducts(), createOrder(), etc.

### 2. Authentication (auth.js)
- Login/Register/Logout flows
- JWT token storage (localStorage)
- Session verification
- Auto-logout on token expiry
- UI updates on auth state change

### 3. UI Utilities (ui.js)
- DOM manipulation helpers
- Component rendering
- Event listeners (event delegation)
- Animation utilities
- HTML template building

### 4. Filters (filters.js)
- Category filtering
- Price range filtering
- Location/seller filtering
- Sort options
- Apply/clear filters

### 5. Components (reusable)
- **Button**: Primary, secondary, danger variants, loading states
- **Card**: Header, content, footer, hover states
- **Modal**: Overlay, close button, animations
- **Toast**: Success, error, warning messages with auto-dismiss

### 6. App Orchestration (app.js)
- Initialize modules
- Register event listeners
- Handle routing (SPA-style)
- Manage app state

## Implementation Strategy

### Phase 1: Structure & CSS
1. Extract all CSS from index.html → modules.css
2. Create clean index.html with module imports only
3. Define CSS variables for theming
4. Implement responsive grid system

### Phase 2: Core Modules
1. Create ApiClient class with all endpoints
2. Create Auth module with token management
3. Create UI utilities for DOM manipulation
4. Create Filters module for product filtering

### Phase 3: Reusable Components
1. Create Button component with variants
2. Create Card component with slots
3. Create Modal component with animation
4. Create Toast component with queue

### Phase 4: Integration
1. Create app.js to orchestrate everything
2. Wire components together
3. Test all major flows
4. Update index.html with proper imports

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| ES6 Modules | Native browser support, clean imports/exports |
| No frameworks | Keep lightweight, vanilla JS benefits |
| CSS Variables | Easy theming, maintainability |
| Event delegation | Performance, fewer event listeners |
| Lazy loading | Performance, load on demand |
| JWT tokens | Stateless auth, scalable |
| Response caching | Reduce API calls, better UX |

## Verification Checklist

### Phase 1 Completion
- [ ] modules.css has all CSS from index.html
- [ ] index.html is < 200 lines
- [ ] All module imports configured
- [ ] No inline styles remain

### Phase 2 Completion
- [ ] ApiClient supports all endpoints
- [ ] Auth module handles login/logout
- [ ] UI utilities tested manually
- [ ] Filters work for products

### Phase 3 Completion
- [ ] Button component has variants
- [ ] Card component renders correctly
- [ ] Modal component animates
- [ ] Toast component auto-dismisses

### Phase 4 Completion
- [ ] App initializes without errors
- [ ] All major flows work
- [ ] No console errors
- [ ] Performance metrics acceptable

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| index.html lines | <200 | 2028 |
| First paint | <1s | ? |
| Module load | <2s | ? |
| API response time | <500ms | ? |
| CSS size | <50KB | ? |

## Notes

- Keep chatbot-widget.js unchanged
- Keep config.js unchanged  
- Focus on code reuse and DRY principles
- Use JSDoc for all functions
- All code should be production-ready
