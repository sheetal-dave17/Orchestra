const _ = require('lodash');
const md5 = require('md5');
const consumer = require('./consumer');
const elasticsearch = require('../services/elasticsearch');

const searcTopics = (queueConfig) => {
  let messagesProcessed = 0;
  const logMessageProcessed = () => {
    messagesProcessed++;
    if(messagesProcessed%100 === 0) {
      console.log("["+ new Date() +"][Search-topics consumer] Processed messages: ", messagesProcessed);
    }
  }

  const processMessage = (message) => {
    if (!message || !message.attributes || !message._id || !message.attributes.accountId) {
      return Promise.resolve(false);
    }

    if (message.event === 'delete') {
      // We are not deleting topics even if message is removed
      return Promise.resolve(true);
    }

    if (!message.attributes.topics || message.attributes.topics.length < 1) {
      return Promise.resolve(true);
    }

    const topics = message.attributes.topics.map(topic => {
      return {
        id: md5(message.attributes.accountId+topic.name),
        name: topic.name,
        accountId: message.attributes.accountId,
        routingId: message.attributes.accountId
      }
    })

    return elasticsearch.saveTopics(topics)
      .then((res) => {
        logMessageProcessed();
        return Promise.resolve(true);
      })
  }

  return {
    consume: () => {
      consumer.consume('search-topics', queueConfig, processMessage, 5);
    }
  }
}

module.exports = searcTopics;
