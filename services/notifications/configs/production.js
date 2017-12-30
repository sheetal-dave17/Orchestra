require('dotenv').config()

module.exports = {
  rabbitmq: {
    host: "10.10.5.234",
    port: 5672,
    default_exchange: "nylas_emails",
  },
  notificationsTimeThreshold: 600000,
  oneSignal: {
    appId: "66895a6d-8650-439b-afe0-e690dcdec958",
    apiKey: "OGNiNGNkMDMtNjRlYy00OTFiLTgyMDYtOWMyYmVhNThlN2Ew"
  },
  sslDirectory: 'ssl-live/',
};
