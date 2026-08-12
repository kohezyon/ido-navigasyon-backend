const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'production',
    });
}

module.exports = Sentry;
