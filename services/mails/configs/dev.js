require('dotenv').config()

module.exports = {
  rabbitmq: {
    host: "localhost",
    port: 5672,
    default_exchange: "nylas_emails",
  },
  messagesProducer: {
    host: "localhost",
    port: 5672,
    exchange: {
      name: 'processed_messages',
      type: 'direct'
    }
  },
  mongodb: {
    topics: {
      url: "mongodb://localhost:27017/deepframe-topics"
    }
  },
  vault: {
    enabled: false,
    host: 'http://127.0.0.1:9200',
    roleId: process.env.VAULT_ROLE_ID,
    secretId: process.env.SECRET_ID
  },
  nylasURL : "http://localhost:5555",
  sslDirectory: 'ssl/',
  deepTopicURL : "http://localhost:9000/api/deeptopicservice/v1",
  deepTextCleanerHost: "http://localhost:3007",
  attachmentsHost: "http://localhost:3000",
  topicsDiscoveryTimeDelta: 5184000000
};
