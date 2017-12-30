const _ = require('lodash');
const consumer = require('./consumer');
const config = require('../configs');
const nylasService = require('../services/nylas');
const vault = require('../services/vault');

const cache = require('../services/auto-replies-cache');

const BODY_MESSAGE_TEMPLATE = `{AUTO_REPLY_CONTENT}
<br>
<blockquote>{MESSAGE_BODY}</blockquote>
`;


const skip = (message) => {
  if (!message) {
    return true;
  }

  if (message.object !== 'message' || message.event !== 'create') {
    return true;
  }

  if (!message.attributes) {
    return true;
  }

  if (!message.attributes.id || !message.attributes.account_id || !message.attributes.from) {
    return true;
  }

  if (!message.attributes.unread) {
    return true;
  }

  const currentTime = new Date().getTime();
  const messageTime = new Date(message.attributes.date).getTime();
  if (messageTime < currentTime - config.autoRepliesTimeThreshold) {
    return true;
  }

  return false;
};

const prepareMessage = (message, autoReplyContent) => {
  if (!message) {
   return Promise.resolve({});
  }

  return vault.decryptMessage(message)
    .then(message => {
      const from = message.to;
      const to = message.from;
      const subject = `RE: ${message.subject}`;
      const body = BODY_MESSAGE_TEMPLATE
        .replace('{AUTO_REPLY_CONTENT}', autoReplyContent)
        .replace('{MESSAGE_BODY}', message.body);

      return {
        subject: subject,
        from: from,
        reply_to: [],
        to: to,
        cc: message.cc,
        bcc: message.bcc,
        body: body,
        file_ids: [],
      }
    })
    .catch(error => {
      return error;
    });
};


const autoReplies = (queueConfig) => {
  let messagesProcessed = 0;
  const logMessageProcessed = () => {
    if(messagesProcessed %10 === 0) {
      console.log("["+ new Date() +"][Autoreplies consumer] Processed messages: ", messagesProcessed);
    }

    messagesProcessed++;
  };

  const processMessage = (message) => {
    if (skip(message)) {
      return Promise.resolve(true);
    }

    const accountId = message.attributes.account_id;

    return cache.getByAccountId(accountId)
      .then(autoReplyConfig => {
        if (!autoReplyConfig || !autoReplyConfig.enabled || !autoReplyConfig.dateFrom || !autoReplyConfig.dateTo) {
          return Promise.resolve(true);
        }

        const currentTime = Date.now();
        if (currentTime < autoReplyConfig.dateFrom.getTime() || currentTime > autoReplyConfig.dateTo.getTime()) {
          return Promise.resolve(true);
        }

        const autoReplyMessage = prepareMessage(message.attributes, autoReplyConfig.content);

        prepareMessage(message.attributes, autoReplyConfig.content)
          .then(autoReplyMessage => {
            return nylasService.sendMessage(autoReplyMessage, accountId)
              .then(data => {
                return Promise.resolve(true);
              })
              .catch(error => {
                console.error(error);
                return Promise.reject(error);
              });
          })
          .catch(error => {
            console.error(error);
            return Promise.reject(error);
          });
      })
      .catch(error => {
        console.error(error);
        return Promise.reject(error);
      });
  };

  return {
    consume: () => {
      consumer.consume('autoReplies', queueConfig, processMessage, 1);
    }
  }
};

module.exports = autoReplies;
