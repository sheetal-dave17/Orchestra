const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const waitingListSchema = new Schema({
  email: {
    type: String,
    require: true,
    index: {
      unique: true,
    }
  },
  name: String,
  familyName: String,
  givenName: String,
  gender: String,
  link: String,
  homeDomain: String,
  locale: String,
  picture: String,
  userId: String,
  verifiedEmail: Boolean
});

module.exports = mongoose.model('WaitingList', waitingListSchema);
