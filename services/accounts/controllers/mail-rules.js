const mongoose = require('mongoose');
const MailRule = require('../models/mongoose/mail-rule');

const mailRulesCache = require('../services/mail-rules-cache');


const formatOutput = (element) => {
  if (!element) {
    return null;
  }

  return {
    id: element._id,
    title: element.title,
    conditionName: element.conditionName,
    conditionRule: element.conditionRule,
    conditionValue: element.conditionValue,
    actionName: element.actionName,
    actionValue: element.actionValue,
  }
};


const controllers = {};


controllers.getAll = (req, res) => {
  if (!req.query.account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const query = {
    accountId: req.query.account_id,
  };
  const sort = {
    _id: 1,
  };

  MailRule.find(query, {}, sort)
    .then(result => {
      const formattedResult = result.map(formatOutput);

      return res.status(200).json({
        success: true,
        data: formattedResult,
      });
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    })
};

controllers.get = (req, res) => {
  if (!req.query.account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({success: false, error: 'id is invalid'});
  }

  const conditions = {
    _id: id,
    accountId: req.query.account_id,
  };

  MailRule.findOne(conditions)
    .then(result => {
      if (!result) {
        return res.status(404).end();
      }

      return res.status(200).json({
        success: true,
        data: formatOutput(result)
      });
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    })
};

controllers.post = (req, res) => {
  const accountId = req.query.account_id;

  if (!accountId) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const title = req.body.title;
  if (!title) {
    return res.status(400).json({success: false, error: 'title is empty'});
  }

  const rule = new MailRule({
    accountId: accountId,
    title: title,
    conditionName: req.body.conditionName,
    conditionRule: req.body.conditionRule,
    conditionValue: req.body.conditionValue,
    actionName: req.body.actionName,
    actionValue: req.body.actionValue,
  });

  rule.save(rule)
    .then(() => {
      mailRulesCache.invalidateByAccountId(accountId);
      return res.status(200).json({success: true, data: {}});
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    });
};

controllers.put = (req, res) => {
  const accountId = req.query.account_id;

  if (!accountId) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({success: false, error: 'id is invalid'});
  }

  const conditions = {
    _id: id,
    accountId: accountId,
  };

  const doc = {
    title: req.body.title,
    conditionName: req.body.conditionName,
    conditionRule: req.body.conditionRule,
    conditionValue: req.body.conditionValue,
    actionName: req.body.actionName,
    actionValue: req.body.actionValue,
  };

  MailRule.update(conditions, doc)
    .then(result => {
      mailRulesCache.invalidateByAccountId(accountId);
      return res.status(200).json({success: true, data: {}});
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    });
};

controllers.delete = (req, res) => {
  const accountId = req.query.account_id;

  if (!accountId) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({success: false, error: 'id is invalid'});
  }

  const conditions = {
    _id: id,
    accountId: accountId,
  };

  MailRule.remove(conditions)
    .then(result => {
      mailRulesCache.invalidateByAccountId(accountId);
      return res.status(200).json({success: true, data: {}});
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    });
};

module.exports = controllers;
