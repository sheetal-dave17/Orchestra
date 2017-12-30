const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const delayedSendSchema = new Schema(
  {
    accountId: {
      type: String,
      index: {
        unique: true
      }
    },
    enabled: Boolean
  },
  {
    collection: 'delayed_send',
  }
);

module.exports = mongoose.model('DelayedSend', delayedSendSchema);
