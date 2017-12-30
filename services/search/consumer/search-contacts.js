const _ = require('lodash');
const md5 = require('md5');
const consumer = require('./consumer');
const elasticsearch = require('../services/elasticsearch');

const searcTopics = (queueConfig) => {
  let messagesProcessed = 0;
  const logMessageProcessed = () => {
    messagesProcessed++;
    if(messagesProcessed%100 === 0) {
      console.log("["+ new Date() +"][Search-contacts consumer] Processed messages: ", messagesProcessed);
    }
  }

  const processMessage = (message) => {
    if (!message || !message.attributes || !message._id || !message.attributes.accountId) {
      return Promise.resolve(false);
    }

    if (message.event === 'delete') {
      // We are not deleting contact even if message is removed
      return Promise.resolve(true);
    }

    if (!message.attributes.participants || message.attributes.participants < 1) {
      return Promise.resolve(true);
    }

    const contacts = message.attributes.participants.map(contact => {
      // Make sure that contact name and emails are defined as string
      const name = contact.name || '';
      const email = contact.email || '';
      return {
        id: md5(message.attributes.accountId+name.toLowerCase()+email.toLowerCase()),
        name: name,
        email: email.toLowerCase(),
        accountId: message.attributes.accountId,
        routingId: message.attributes.accountId
      }
    })

    return elasticsearch.saveContacts(contacts)
      .then((res) => {
        logMessageProcessed();
        return Promise.resolve(true);
      })
  }

  return {
    consume: () => {
      consumer.consume('search-contacts', queueConfig, processMessage, 5);
    }
  }
}

module.exports = searcTopics;
