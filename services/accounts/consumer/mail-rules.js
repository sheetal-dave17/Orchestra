const _ = require('lodash');
const consumer = require('./consumer');
const config = require('../configs');
const nylasService = require('../services/nylas');

const rulesCache = require('../services/mail-rules-cache');
const emailsCache = require('../services/account-emails-cache');

const BODY_MESSAGE_TEMPLATE = `
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

  const currentTime = new Date().getTime();
  const messageTime = new Date(message.attributes.date).getTime();
  if (messageTime < currentTime - config.mailRulesTimeThreshold) {
    return true;
  }

  return false;
};

const prepareMessage = (message, forwardTo) => {
  if (!message) {
    return {};
  }

  const from = message.to;
  const to = [{email: forwardTo}];
  const subject = `fwd: ${message.subject}`;
  const body = BODY_MESSAGE_TEMPLATE
    .replace('{MESSAGE_BODY}', message.body);

  return  {
    subject: subject,
    from: from,
    reply_to: [],
    to: to,
    cc: message.cc,
    bcc: message.bcc,
    body: body,
    file_ids: [],
  }
};


const allowedConditionNames = [
  'cc',
  'from',
  'subject',
  'to',
];

const allowedConditionRules = [
  'contains',
  'doesNotContain',
];

const allowedActionNames = [
  'messageForward',
  'messageMarkAsRead',
];


const validateConditions = (message, name, rule, value) => {
  const checkValue = message[name];
  let result = false;

  switch (name) {
    case 'subject':
      result = checkValue.includes(value);
      break;

    case 'cc':
    case 'from':
    case 'to':
      result = checkValue.some(contact => {
        return    contact.email.includes(value)
               || contact.name.includes(value);
      });
      break;
    default:
      return false;
  }

  if (rule === 'doesNotContain') {
    result = !result;
  }

  return result;
};


const processRule = (accountId, accountEmail, message, rule) => {
  return new Promise((resolve, reject) => {
    if (!rule) {
      return reject();
    }

    const conditionName = rule.conditionName;
    const conditionRule = rule.conditionRule;
    const conditionValue = rule.conditionValue;
    const actionName = rule.actionName;
    const actionValue = rule.actionValue;

    const emailFrom = message.from[0].email;

    if (emailFrom === accountEmail) {
      return resolve();
    }

    if (!allowedConditionNames.includes(conditionName)) {
      return resolve();
    }

    if (!allowedConditionRules.includes(conditionRule)) {
      return resolve();
    }

    if (!allowedActionNames.includes(actionName)) {
      return resolve();
    }

    if (!validateConditions(message, conditionName, conditionRule, conditionValue)) {
      return resolve();
    }

    switch (actionName) {
      case 'messageMarkAsRead':
        nylasService.markAsRead(accountId, message.id)
          .then(resolve)
          .catch(resolve);

        break;
      case 'messageForward':
        const emailTo = actionValue;

        if (emailTo === accountEmail) {
          return resolve();
        }

        const preparedMessage = prepareMessage(message, emailTo);

        nylasService.sendMessage(preparedMessage, accountId)
          .then(resolve)
          .catch(resolve);

        break;
    }

  });

};


const mailRules = (queueConfig) => {
  const processMessage = (message) => {
    if (skip(message)) {
      return Promise.resolve(true);
    }

    const accountId = message.attributes.account_id;

    return emailsCache.getByAccountId(accountId)
      .then(accountEmail => {
        return rulesCache.getByAccountId(accountId)
          .then(mailRulesConfig => {
            if (!mailRulesConfig || !mailRulesConfig.length) {
              return Promise.resolve(true);
            }

            const actions = mailRulesConfig.map(rule => {
              return processRule(accountId, accountEmail, message.attributes, rule);
            });

            return Promise.all(actions)
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
        return Promise.reject(error);
      });
  };

  return {
    consume: () => {
      consumer.consume('mailRules', queueConfig, processMessage, 1);
    }
  }
};

module.exports = mailRules;
