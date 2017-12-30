require('dotenv').config();

module.exports = {
  rabbitmq: {
    host: "10.10.5.234",
    port: 5672,
    default_exchange: "nylas_emails",
  },
  autoRepliesTimeThreshold: 600000,
  mailRulesTimeThreshold: 600000,
  mongoDB: "mongodb://10.10.3.15:27017/deepframe-accounts",
  vault: {
    enabled: true,
    host: 'http://10.10.25.49:9200',
    roleId: process.env.VAULT_ROLE_ID,
    secretId: process.env.SECRET_ID
  },
  nylasURL: "http://10.10.4.142:5555",
  sslDirectory: 'ssl-live/',
};
