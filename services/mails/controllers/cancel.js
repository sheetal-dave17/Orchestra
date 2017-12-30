const Message = require('../models/mongoose/message');

const controllers = {};


controllers.delete = (req, res) => {
  const accountId = req.query.account_id;

  if (!accountId) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const conditions = {accountId};

  Message.remove(conditions)
    .then(result => {
      return res.status(200).json({success: true, data: {}});
    })
    .catch(error => {
      console.error(error);
      return res.status(500).json({success: false, error: error});
    });

};

module.exports = controllers;
