const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const autoReplySchema = new Schema(
  {
    accountId: String,
    content: String,
    dateFrom: Date,
    dateTo: Date,
    enabled: Boolean,
  },
  {
    collection: 'auto_replies',
  }
);

autoReplySchema.index(
  {accountId: 1},
  {unique: true}
);
autoReplySchema.index(
  {dateFrom: 1, dateTo: 1}
);

module.exports = mongoose.model('AutoReply', autoReplySchema);
