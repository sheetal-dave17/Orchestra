const _ = require('lodash');
const request = require('request-promise-native');
const consumer = require('./consumer');
const Message = require('../models/mongoose/message');
const htmlConverter = require('../html-converter');
const config = require('../configs');

const messages = (queueConfig, vault) => {
  let messagesProcessed = 0;
  const logMessageProcessed = () => {
    if(messagesProcessed%100 === 0) {
      console.log("["+ new Date() +"][Messages consumer] Processed messages: ", messagesProcessed);
    }

    messagesProcessed++;
  }

  const processMessage = (message) => {
    if (message.object !== 'message') {
      return Promise.resolve(true);
    }

    if (!message.attributes || ! message.attributes.id) {
      return Promise.resolve(true);
    }

    logMessageProcessed();

    // TODO: add handling for remove message

    return vault.decryptMessage(message.attributes)
      .then(message => {
        if (message.encrypted) {
          return Promise.reject('Can\'t decrypt message');
        }

        // Replacing inline attached images with http urls
        if (message.files) {
          message.files.forEach(file => {
            message.body = message.body.replace(
              new RegExp("cid:" + file.content_id, "g"),
              config.attachmentsHost + "/api/mail/files/" + file.id
            );
          })
        }
        message.bodyText = htmlConverter.getText(message.body);
        return vault.encryptMessage(message)
      })
      .then(message => {
        return Message.findOneAndUpdate(
          {messageId: message.id},
          {
            messageId: message.id,
            accountId: message.account_id,
            threadId: message.thread_id,
            subject: message.subject,
            from: message.from[0],
            to: message.to,
            cc: message.cc,
            bcc: message.bcc,
            participants: _.union(message.from, message.to, message.cc, message.bcc),
            date: new Date(message.date),
            unread: message.unread,
            starred: message.starred,
            snippet: message.snippet,
            body: message.body,
            bodyText: message.bodyText,
            encrypted: message.encrypted,
            files: message.files,
            folder: message.folder,
            labels: message.labels
          },
          { upsert:true }
        )
      })
  }
  return {
    consume: () => {
      consumer.consume('messages', queueConfig, processMessage, 1);
    }
  }
}

module.exports = messages;
