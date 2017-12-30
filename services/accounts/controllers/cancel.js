const AutoReply = require('../models/mongoose/auto-reply');
const DelayedSend = require('../models/mongoose/delayed-send');
const MailRule = require('../models/mongoose/mail-rule');
const QuickReplyTemplate = require('../models/mongoose/quick-reply-template');
const Signature = require('../models/mongoose/signature');

const controllers = {};


controllers.delete = (req, res) => {
  const accountId = req.query.account_id;

  if (!accountId) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const conditions = {accountId};

  const requests = [];

  requests.push(AutoReply.remove(conditions));
  requests.push(DelayedSend.remove(conditions));
  requests.push(MailRule.remove(conditions));
  requests.push(QuickReplyTemplate.remove(conditions));
  requests.push(Signature.remove(conditions));

  Promise.all(requests)
    .then(result => {
      return res.status(200).json({success: true, data: {}});
    })
    .catch(error => {
      console.error(error);
      return res.status(500).json({success: false, error: error});
    })
};

module.exports = controllers;
