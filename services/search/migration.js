const elasticsearch = require('elasticsearch');

const config = require('./configs');

const esClient = new elasticsearch.Client({
  host: config.elasticsearchAdmin.host,
  httpAuth: config.elasticsearchAdmin.auth,
});

const indexes = [
  {
    name: 'messages',
    body: require('./migrations/messages.json'),
  },
  {
    name: 'contacts',
    body: require('./migrations/contacts.json'),
  },
  {
    name: 'topics',
    body: require('./migrations/topics.json'),
  },
  {
    name: 'history',
    body: require('./migrations/history.json'),
  }
]

console.log("Indexes prepeared.");

let promises = [];

indexes.forEach(index => {
  promises.push(
    esClient.indices.delete({
      index: index.name,
      ignore_unavailable: true
    }).then(() => {
      return esClient.indices.create({
        index: index.name,
        body: index.body
      })
    })
  )
})

console.log("Requests initialized");

Promise.all(promises)
  .then(() => console.log("Indexes created"))
  .catch(err => console.error("Insexes creation error:\n", err))
