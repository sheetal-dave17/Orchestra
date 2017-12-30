require('dotenv').config();

module.exports = {
  rabbitmq: {
    host: 'localhost',
    port: 5672,
    exchange: {
      name: 'processed_messages',
      type: 'direct'
    },
    routes: ['insert','update','delete']
  },
  elasticsearch: {
    host: '172.19.0.4:29200',
    auth: 'search:k3msn4hdb57dshdbak1n3bfansbf',
    requestTimeout: 10000
  },
  elasticsearchAdmin: {
    host: '172.19.0.4:29300',
    auth: 'admin:kl36db38fn59hj5m3hdn2k14',
    requestTimeout: 10000
  },
  vault: {
    enabled: false,
    host: 'http://127.0.0.1:9200',
    roleId: process.env.VAULT_ROLE_ID,
    secretId: process.env.SECRET_ID
  },
  sslDirectory: 'ssl/',
};
