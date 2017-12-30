const fs = require('fs');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const config = require('./configs');
const _ = require('lodash');

const OneSignalClient = require('node-onesignal').default;
const pushNotificationsClient = new OneSignalClient(config.oneSignal.appId, config.oneSignal.apiKey);

const notificationsConsumer = require('./consumer/notifications');

const consumers = {
  notifications: notificationsConsumer(config.rabbitmq, pushNotificationsClient)
};

const app = express();
app.use(bodyParser.json());

app.get('/api/test', (req, res) => {
  res.status(200).json({success: true});
});


app.post('/api/mail/messages/snooze', (req, res) => {
  const messageId = req.body.id;
  if (!messageId) {
    return res.status(400).json({success: false, error: 'message id is missed'});
  }

  const userId = req.query.account_id;
  if (!userId) {
    return res.status(400).json({success: false, error: 'account id is missed'});
  }

  return pushNotificationsClient.sendNotification('You have snooze mail', {
    filters: [{
      field: 'tag',
      key: 'user_id',
      relation: '=',
      value:  userId
    }],
    headings: {en: 'Snooze mail'},
    data: {
      eventName: 'snoozeMail',
      messageId: messageId,
    },
    url: `/mail/inbox/?messageId=${messageId}`
  })
    .then(result => {
      return res.json({success: true, data: result});
    })
    .catch(error => {
      console.error(error);
      return res.status(500).json({success: false, error: error});
    });
});


https.createServer({
  key: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-server.key.pem`),
  cert: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-server.crt.pem`),
  ca: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-root-ca.crt.pem`),
  requestCert: false,
  rejectUnauthorized: true,
}, app).listen(3005, function () {
  console.log('Notifications micro-service listening on port 3005!');
});

consumers.notifications.consume();
