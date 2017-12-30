const request = require('request-promise-native');

const nylasUrl = require('../configs').nylasURL;



const Nylas = {};

Nylas.sendMessage = (message, userId) => {
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
        user: userId,
        pass: '',
        sendImmediately: false
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

Nylas.getAccount = (userId) => {
  return request
    .get({
      url: nylasUrl + '/account/',
      auth: {
        'user': userId,
        'pass': '',
        'sendImmediately': false
      },
      json: true
    })
    .then(response => {
      return Promise.resolve({
        id: response.id,
        name: response.name,
        email: response.email_address,
        provider: response.provider,
        status: response.sync_state
      });
    })
    .catch(error => {
      console.log(error);
      return Promise.reject(error);
    });
};

Nylas.markAsRead = (userId, messageId) => {
  return request
    .put({
      url: `${nylasUrl}/messages/${messageId}`,
      body: {unread: false},
      auth: {
        'user': userId,
        'pass': '',
        'sendImmediately': false
      },
      json: true
    })
    .then(result => {
      return Promise.resolve();
    })
    .catch(error => {
      console.log(error);
      return Promise.reject(error);
    });
};

module.exports = Nylas;
