const _ = require('lodash');
const consumer = require('./consumer');
const config = require('../configs');


const notifications = (queueConfig, pushNotificationsClient) => {
  let messagesProcessed = 0;
  const logMessageProcessed = () => {
    if(messagesProcessed%10 === 0) {
      console.log("["+ new Date() +"][Notigications consumer] Processed messages: ", messagesProcessed);
    }

    messagesProcessed++;
  }
  const processMessage = (message) => {
    if (message.object !== 'message' || message.event !== 'create') {
      return Promise.resolve(true);
    }

    if (!message.attributes || !message.attributes.id) {
      console.log("Empty message");
      return Promise.resolve(true);
    }

    if (!message.attributes.unread ||
        new Date(message.attributes.date).getTime() < new Date().getTime()-config.notificationsTimeThreshold) {
      return Promise.resolve(true);
    }

    return pushNotificationsClient.sendNotification('You have new unread message', {
      filters: [{
        field: 'tag',
        key: 'user_id',
        relation: '=',
        value:  message.attributes.account_id
      }],
      headings: {en: 'New Message'},
    })
    .then(res => {
      logMessageProcessed();
      return Promise.resolve(true);
    })
    .catch(err => {
      console.error(err);
      return Promise.reject(false);
    });
  }
  return {
    consume: () => {
      consumer.consume('notifications', queueConfig, processMessage, 1);
    }
  }
}

module.exports = notifications;
