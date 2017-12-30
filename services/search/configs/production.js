require('dotenv').config();

module.exports = {
  rabbitmq: {
    host: '10.10.5.234',
    port: 5672,
    exchange: {
      name: 'processed_messages',
      type: 'direct'
    },
    routes: ['insert','update','delete']
  },
  elasticsearch: {
    host: '10.10.3.237:29200',
    auth: process.env.ELASTICSEARCH_SEARCH_AUTH,
    requestTimeout: 10000
  },
  elasticsearchAdmin: {
    host: '10.10.3.237:29300',
    auth: process.env.ELASTICSEARCH_ADMIN_AUTH,
    requestTimeout: 10000
  },
  vault: {
    enabled: true,
    host: 'http://10.10.25.49:9200',
    roleId: process.env.VAULT_ROLE_ID,
    secretId: process.env.SECRET_ID
  },
  sslDirectory: 'ssl-live/',
};
