const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const quickReplyTemplateSchema = new Schema(
  {
    accountId: String,
    content: String,
    title: String,
  },
  {
    collection: 'quick_reply_templates',
  }
);

quickReplyTemplateSchema.index(
  {accountId: 1, title: 1},
  {unique: true}
);

module.exports = mongoose.model('QuickReplyTemplate', quickReplyTemplateSchema);
