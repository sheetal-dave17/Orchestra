const _ = require('lodash');
const request = require('request-promise-native');

const consumer = require('./consumer');
const config = require('../configs');
const htmlConverter = require('../html-converter');
const Message = require('../models/mongoose/message');

const topics = (queueConfig, vault) => {
  let messagesProcessed = 0;
  const logMessageProcessed = () => {
    if(messagesProcessed%100 === 0) {
      console.log("["+ new Date() +"][Topics consumer] Processed messages: ", messagesProcessed);
    }

    messagesProcessed++;
  }
  const processTopics = (message) => {
    if (message.object !== 'message' || message.event !== 'create' ) {
      return Promise.resolve(true);
    }

    if (new Date(message.attributes.date).getTime() < new Date().getTime()-config.topicsDiscoveryTimeDelta) {
      return Promise.resolve(true);
    }

    return vault.decryptMessage(message.attributes)
      .then(message => {
        if (message.encrypted) {
          return Promise.reject('Can\'t decrypt message');
        }

        let html = message.body;

        // Replacing inline attached images with http urls
        if (message.files) {
          message.files.forEach(file => {
            html = html.replace(
              new RegExp("cid:" + file.content_id, "g"),
              config.attachmentsHost + "/api/mail/files/" + file.id
            );
          })
        }

        const text = htmlConverter.getTextMap(html);
        const textNormalized = htmlConverter.getText(html);

        if (textNormalized !== null && textNormalized !== '') {
          return request
            .post({
              url: config.deepTopicURL,
              form: {algorithm: "soa", text: textNormalized},
              json: true
            })
            .then(topics => {
              if(!Array.isArray(topics)) {
                console.log('Invalid topics value for message_id: ', message.id,
                            '\nTopics Value: ', topics);
                return Promise.reject(false);
              }
              topics = mapTopicsOffsets(topics, textNormalized, text);
              return updateMessageTopics(message.id, topics)
                .then(() => {
                  logMessageProcessed();
                  return Promise.resolve(true);
                });
            })
            .catch(err => {
              console.log(err.message);
              return Promise.reject(false);
            })
        } else {
          return Promise.resolve(true);
        }
      });
  };
  const updateMessageTopics = (messageId, topics) => {
    return Message.findOneAndUpdate(
      {messageId: messageId},
      {
        topics: topics
      },
      { upsert:true }
    )
  };
  const mapTopicsOffsets = (topics, text, spacedText) => {
    let result = []

    topics.forEach(topic => {
      let updatedTopic = {
        name: topic.name,
        score: topic.score,
        source: topic.source || 'deeptopic',
        textOffsets: topic.offset,
        htmlOffsets: []
      }
      let offsetPosition = 0;
      let offsetText = spacedText;
      let offsetGlobal = 0;
      topic.offset = _.orderBy(topic.offset, ['start', 'end'], ['asc', 'asc']);
      topic.offset.forEach(offset => {
        let currentText = _.escapeRegExp(text.slice(offset.start, offset.end));
        let words = currentText.trim().split(/\s/);
        currentText = words.join('\\s+');
        let match = offsetText.match(new RegExp(currentText), 'g');
        if (!match) {
          return false;
        }
        let offsetOfIteration = 0;
        words.forEach(word => {
          updatedTopic.htmlOffsets.push({
            start: match['index'] + match[0].indexOf(word, offsetOfIteration) + offsetGlobal,
            end: match['index'] + match[0].indexOf(word, offsetOfIteration) + word.length + offsetGlobal,
          })
          offsetOfIteration = match[0].indexOf(word, offsetOfIteration) + word.length;
        })
        offsetGlobal += match['index'] + match[0].length;
        offsetText = spacedText.slice(offsetGlobal)
      })
      result.push(updatedTopic);
    });

    return result;
  }
  return {
    consume: () => {
      consumer.consume('topics', queueConfig, processTopics, 1);
    },
    processTopics: (message) => processTopics(message)
  };
}

module.exports = topics;
