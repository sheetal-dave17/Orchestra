const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const mailRuleSchema = new Schema(
  {
    accountId: String,
    title: String,
    conditionName: String,
    conditionRule: String,
    conditionValue: String,
    actionName: String,
    actionValue: String,
  },
  {
    collection: 'mail_rules',
  }
);

mailRuleSchema.index(
  {accountId: 1, title: 1},
  {unique: true}
);

module.exports = mongoose.model('MailRule', mailRuleSchema);
