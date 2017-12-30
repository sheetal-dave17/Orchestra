require('dotenv').config()

module.exports = {
  rabbitmq: {
    host: "10.10.5.234",
    port: 5672,
    default_exchange: "nylas_emails",
  },
  messagesProducer: {
    host: "10.10.5.234",
    port: 5672,
    exchange: {
      name: 'processed_messages',
      type: 'direct'
    }
  },
  mongodb: {
    topics: {
      url: "mongodb://10.10.3.15:27017/deepframe-topics"
    }
  },
  vault: {
    enabled: true,
    host: 'http://10.10.25.49:9200',
    roleId: process.env.VAULT_ROLE_ID,
    secretId: process.env.SECRET_ID
  },
  nylasURL : "http://10.10.4.142:5555",
  sslDirectory: 'ssl-live/',
  deepTopicURL : "http://10.10.6.51:9000/api/deeptopicservice/v1",
  deepTextCleanerHost: "http://10.10.6.57:3007",
  attachmentsHost: "https://api.deepframe.io",
  topicsDiscoveryTimeDelta: 630720000000
};
