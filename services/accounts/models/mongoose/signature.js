const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const signatureSchema = new Schema({
  accountId: {
    type: String,
    require: true,
    index: true
  },
  title: {
    type: String,
    require: true
  },
  content:{
    type: String,
    require: true
  },
  isDefault: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('Signature', signatureSchema);
