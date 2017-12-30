const elasticsearch = require('elasticsearch');

const config = require('../configs');


searchClient = new elasticsearch.Client({
  host: config.elasticsearch.host,
  httpAuth: config.elasticsearch.auth,
  requestTimeout: config.elasticsearch.requestTimeout,
});

adminClient = new elasticsearch.Client({
  host: config.elasticsearchAdmin.host,
  httpAuth: config.elasticsearchAdmin.auth,
  requestTimeout: config.elasticsearchAdmin.requestTimeout,
});

const elasticsearchService = {
  getMessage: (documentId, routingId) => {
    return adminClient.get({
      index: 'messages',
      type: 'message',
      id: documentId,
      routing: routingId
    })
  },

  saveMessage: (documentId, routingId, message) => {
    return adminClient.index({
      index: 'messages',
      type: 'message',
      id: documentId,
      body: message,
      routing: routingId
    })
  },

  deleteMessage: (documentId, routingId) => {
    return adminClient.delete({
      index: 'messages',
      type: 'message',
      id: documentId,
      routing: routingId
    })
  },

  saveTopics: (topics) => {
    let updateBody = [];
    topics.forEach(topic => {
      updateBody.push({index: {_index: 'topics', _type : 'topic', _id: topic.id, _routing: topic.routingId}});
      updateBody.push({name: topic.name, accountId: topic.accountId});
    })
    return adminClient.bulk({body: updateBody});
  },

  saveContacts: (contacts) => {
    let updateBody = [];
    contacts.forEach(contact => {
      updateBody.push({index: {_index: 'contacts', _type : 'contact', _id: contact.id, _routing: contact.routingId}});
      updateBody.push({name: contact.name, email: contact.email, accountId: contact.accountId});
    })
    return adminClient.bulk({body: updateBody});
  }
}

module.exports = elasticsearchService;
