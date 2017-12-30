require('dotenv').config()

module.exports = {
  rabbitmq: {
    host: "localhost",
    port: 5672,
    default_exchange: "nylas_emails",
  },
  notificationsTimeThreshold: 600000,
  oneSignal: {
    appId: "8d4ff732-d9bc-4fa7-a90a-a3f6bf1f74b2",
    apiKey: "N2YyYzlkNzQtZDc0OS00ODQ4LTliNGUtMTRhZjQxNmVjM2Y0"
  },
  sslDirectory: 'ssl/',
};
