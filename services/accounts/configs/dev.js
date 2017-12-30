require('dotenv').config();

module.exports = {
  rabbitmq: {
    host: "localhost",
    port: 5672,
    default_exchange: "nylas_emails",
  },
  autoRepliesTimeThreshold: 600000,
  mailRulesTimeThreshold: 600000,
  mongoDB: "mongodb://localhost:27017/deepframe-accounts",
  vault: {
    enabled: false,
    host: 'http://127.0.0.1:9200',
    roleId: process.env.VAULT_ROLE_ID,
    secretId: process.env.SECRET_ID
  },
  nylasURL: "http://localhost:5555",
  sslDirectory: 'ssl/',
};
