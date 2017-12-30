const request = require('request-promise-native');

const nylasUrl = require('../configs').nylasURL;



const Nylas = {};

Nylas.sendMessage = function (message, user) {
  return request
    .post({
      url: nylasUrl + '/send',
      body: {
        subject: message.subject,
        reply_to_message: message.reply_to_message,
        from: message.from,
        reply_to: message.reply_to,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        body: message.body,
        file_ids: message.file_ids,
      },
      auth: {
        'user': user.inbox_account_id,
        'pass': '',
        'sendImmediately': false
      },
      json: true
    })
    .then(data => {
      return Promise.resolve(data);
    })
    .catch(error => {
      console.error(error);
      return Promise.reject(error);
    });
};

module.exports = Nylas;
