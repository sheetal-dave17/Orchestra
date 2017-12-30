const _ = require('lodash');
const consumer = require('./consumer');
const elasticsearch = require('../services/elasticsearch');

const searchMessages = (queueConfig, vault) => {
  let messagesProcessed = 0;
  const logMessageProcessed = () => {
    messagesProcessed++;
    if(messagesProcessed%100 === 0) {
      console.log("["+ new Date() +"][Search-messages consumer] Processed messages: ", messagesProcessed);
    }
  }

  const formatContact = (contact) => {
    if (!contact) {
      return null;
    }
    return {
      email: contact.email,
      name: contact.name
    }
  }
  const formatContacts = (contacts) => {
    if (!contacts) {
      return null;
    }
    return contacts.map(formatContact)
  }

  const processMessage = (message) => {
    if (!message || !message.attributes || !message._id || !message.attributes.accountId) {
      return Promise.resolve(false);
    }

    if (message.event === 'delete') {
      return elasticsearch.deleteMessage(message._id, message.attributes.accountId);
    }

    return vault.decryptMessage(message.attributes).then(decryptedMessage => {
      let formattedMessage = {
        accountId: decryptedMessage.accountId,
        messageId: decryptedMessage.messageId,
        from: formatContact(decryptedMessage.from),
        to: formatContacts(decryptedMessage.to),
        cc: formatContacts(decryptedMessage.cc),
        bcc: formatContacts(decryptedMessage.bcc),
        subject: decryptedMessage.subject,
        bodyText: decryptedMessage.bodyText,
        snippet: decryptedMessage.snippet,
        date: decryptedMessage.date,
        labels: decryptedMessage.labels ? decryptedMessage.labels.map(label => label.id) : null,
        files: decryptedMessage.files ? decryptedMessage.files.map(file => file.filename || file.content_id) : null,
        topics: decryptedMessage.topics ? decryptedMessage.topics.map(topic => topic.name) : null
      }
      formattedMessage = _.pickBy(formattedMessage);

      if(_.isEmpty(formattedMessage)) {
        return Promise.resolve(true);
      }

      return elasticsearch.saveMessage(message._id, formattedMessage.accountId, formattedMessage)
        .then(() => {
          logMessageProcessed();
          return Promise.resolve(true);
        })
    })
  }

  return {
    consume: () => {
      consumer.consume('search-messages', queueConfig, processMessage, 5);
    }
  }
}

module.exports = searchMessages;
