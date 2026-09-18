/**
 * Logging system for DiscoveryShop frontend
 * @module utils/logger
 */

/**
 * Logger levels
 */
const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    CRITICAL: 4
};

/**
 * Logger configuration
 */
class LoggerConfig {
    constructor() {
        this.level = LogLevel.INFO;
        this.useConsole = true;
        this.useStorage = true;
        this.maxStorageEntries = 500;
        this.isDevelopment = !window.location.hostname || window.location.hostname === 'localhost';
    }

    setLevel(level) {
        this.level = level;
    }

    setUseConsole(value) {
        this.useConsole = value;
    }

    setUseStorage(value) {
        this.useStorage = value;
    }
}

/**
 * Logger instance
 */
class Logger {
    constructor() {
        this.config = new LoggerConfig();
        this.storageLogs = [];
        this.loadStorageLogs();
    }

    /**
     * Load logs from localStorage
     */
    loadStorageLogs() {
        try {
            const stored = localStorage.getItem('app_logs');
            if (stored) {
                this.storageLogs = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Could not load logs from storage:', error);
        }
    }

    /**
     * Save logs to localStorage
     */
    saveStorageLogs() {
        try {
            if (this.config.useStorage) {
                // Keep only last N entries
                const logsToSave = this.storageLogs.slice(-this.config.maxStorageEntries);
                localStorage.setItem('app_logs', JSON.stringify(logsToSave));
            }
        } catch (error) {
            console.warn('Could not save logs to storage:', error);
        }
    }

    /**
     * Add log entry
     */
    addLog(level, message, data, stackTrace) {
        const timestamp = new Date().toISOString();
        const levelName = Object.keys(LogLevel).find(key => LogLevel[key] === level) || 'UNKNOWN';

        const logEntry = {
            timestamp,
            level: levelName,
            message,
            data: data || null,
            stackTrace: stackTrace || null,
            url: window.location.href
        };

        // Console logging
        if (this.config.useConsole && level >= this.config.level) {
            this.logToConsole(levelName, message, data);
        }

        // Storage logging
        if (this.config.useStorage) {
            this.storageLogs.push(logEntry);
            this.saveStorageLogs();
        }

        return logEntry;
    }

    /**
     * Log to console with styling
     */
    logToConsole(level, message, data) {
        const styles = {
            DEBUG: 'color: #666; font-weight: normal;',
            INFO: 'color: #0066cc; font-weight: bold;',
            WARN: 'color: #ff9900; font-weight: bold;',
            ERROR: 'color: #ff0000; font-weight: bold;',
            CRITICAL: 'color: #ff0000; background-color: #ffcccc; font-weight: bold; padding: 4px 8px;'
        };

        const style = styles[level] || 'color: black;';
        console.log(`%c[${level}] ${message}`, style, data || '');
    }

    /**
     * Debug log
     */
    debug(message, data) {
        return this.addLog(LogLevel.DEBUG, message, data);
    }

    /**
     * Info log
     */
    info(message, data) {
        return this.addLog(LogLevel.INFO, message, data);
    }

    /**
     * Warning log
     */
    warn(message, data) {
        return this.addLog(LogLevel.WARN, message, data);
    }

    /**
     * Error log
     */
    error(message, data, error) {
        const stackTrace = error?.stack || null;
        return this.addLog(LogLevel.ERROR, message, data, stackTrace);
    }

    /**
     * Critical log
     */
    critical(message, data, error) {
        const stackTrace = error?.stack || null;
        return this.addLog(LogLevel.CRITICAL, message, data, stackTrace);
    }

    /**
     * Log API request
     */
    logRequest(method, endpoint, data) {
        this.debug(`API Request: ${method} ${endpoint}`, data);
    }

    /**
     * Log API response
     */
    logResponse(method, endpoint, status, data) {
        const level = status >= 400 ? LogLevel.WARN : LogLevel.DEBUG;
        this.addLog(level, `API Response: ${method} ${endpoint} (${status})`, data);
    }

    /**
     * Log API error
     */
    logApiError(method, endpoint, status, error) {
        this.error(`API Error: ${method} ${endpoint} (${status})`, error);
    }

    /**
     * Log user action
     */
    logAction(action, details) {
        this.info(`User Action: ${action}`, details);
    }

    /**
     * Log performance metric
     */
    logPerformance(metric, duration, details) {
        const message = `Performance: ${metric} took ${duration}ms`;
        this.debug(message, details);
    }

    /**
     * Get all logs
     */
    getLogs() {
        return [...this.storageLogs];
    }

    /**
     * Get logs filtered by level
     */
    getLogsByLevel(level) {
        const levelName = Object.keys(LogLevel).find(key => LogLevel[key] === level);
        return this.storageLogs.filter(log => log.level === levelName);
    }

    /**
     * Get logs filtered by date range
     */
    getLogsByDateRange(startDate, endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();

        return this.storageLogs.filter(log => {
            const timestamp = new Date(log.timestamp).getTime();
            return timestamp >= start && timestamp <= end;
        });
    }

    /**
     * Search logs
     */
    searchLogs(query) {
        const lowerQuery = query.toLowerCase();
        return this.storageLogs.filter(log =>
            log.message.toLowerCase().includes(lowerQuery) ||
            (log.data && JSON.stringify(log.data).toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Clear all logs
     */
    clearLogs() {
        this.storageLogs = [];
        try {
            localStorage.removeItem('app_logs');
        } catch (error) {
            console.warn('Could not clear logs from storage:', error);
        }
    }

    /**
     * Export logs as JSON
     */
    exportLogsAsJSON() {
        return JSON.stringify(this.storageLogs, null, 2);
    }

    /**
     * Export logs as CSV
     */
    exportLogsAsCSV() {
        const headers = ['Timestamp', 'Level', 'Message', 'Data', 'URL'];
        const rows = this.storageLogs.map(log => [
            log.timestamp,
            log.level,
            log.message,
            JSON.stringify(log.data || ''),
            log.url
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        return csvContent;
    }

    /**
     * Download logs as file
     */
    downloadLogs(format = 'json') {
        const content = format === 'json' ? this.exportLogsAsJSON() : this.exportLogsAsCSV();
        const mimeType = format === 'json' ? 'application/json' : 'text/csv';
        const filename = `logs_${new Date().toISOString().slice(0, 10)}.${format}`;

        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }

    /**
     * Get logger statistics
     */
    getStatistics() {
        const stats = {
            total: this.storageLogs.length,
            byLevel: {},
            oldestLog: this.storageLogs[0],
            newestLog: this.storageLogs[this.storageLogs.length - 1]
        };

        Object.keys(LogLevel).forEach(level => {
            stats.byLevel[level] = this.getLogsByLevel(LogLevel[level]).length;
        });

        return stats;
    }

    /**
     * Create a timer for performance measurement
     */
    createTimer(label) {
        const startTime = performance.now();
        return {
            end: () => {
                const duration = Math.round(performance.now() - startTime);
                this.logPerformance(label, duration);
                return duration;
            }
        };
    }
}

// Export singleton logger instance
export const logger = new Logger();

// Export LogLevel for advanced usage
export { LogLevel };

// For development: expose logger to window
if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || !window.location.hostname)) {
    window.__logger = logger;
}
