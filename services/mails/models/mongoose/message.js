const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const config = require('../../configs');
const messagesProducer = require('../../producer/producer')(config.messagesProducer);

const contactSchema = new Schema({
  email: String,
  name: String,
  _id: false
});

const folderSchema = new Schema({
  id: String,
  name: String,
  displayName: String,
  _id: false
});

const fileSchema = new Schema({
  id: String,
  filename: String,
  size: Number,
  content_type: String,
  content_id: String,
  _id: false
});

const topicSchema = new Schema({
  name: String,
  score: Number,
  source: String,
  textOffsets: [{start: Number, end: Number}],
  htmlOffsets: [{start: Number, end: Number}],
  _id: false
});

const topicAnnotationSchema = new Schema({
  name: String,
  rating: String,
  _id: false
});

const messageSchema = new Schema({
  messageId: {
    type: String,
    index: {
      unique: true,
      dropDups: true
    }
  },
  accountId: String,
  threadId: String,
  subject: String,
  from: contactSchema,
  to: [contactSchema],
  cc: [contactSchema],
  bcc: [contactSchema],
  participants: [contactSchema],
  date: Date,
  unread: Boolean,
  starred: Boolean,
  deleted : {type: Boolean, default: false},
  pinned : {type: Boolean, default: false},
  snippet: String,
  body: String,
  encrypted: Boolean,
  bodyText: String,
  files: [fileSchema],
  folder: folderSchema,
  labels: [folderSchema],
  topics: [topicSchema],
  topicsAnnotations: [topicAnnotationSchema],
  textShared: Boolean,
  replied: Boolean,
  forwarded: Boolean
});

messageSchema.index({ 'accountId': 1, 'labels.name': 1, 'date': -1 });
messageSchema.index({accountId: 1, deleted: -1, 'labels.id': 1, date: -1});
messageSchema.index({accountId: 1, deleted: -1, 'labels.name': 1, date: -1});

// Define middleware for message update observation and publish it to Stitch
messageSchema.post('save', doc => {
  if (doc) {
    messagesProducer.publish({
      _id: doc._id,
      event: 'insert',
      attributes: doc
    }, 'insert');
  }
})
messageSchema.post('update', doc => {
  if (doc) {
    messagesProducer.publish({
      _id: doc._id,
      event: 'update',
      attributes: doc
    }, 'update');
  }
})
messageSchema.post('findOneAndUpdate', doc => {
  if (doc) {
    messagesProducer.publish({
      _id: doc._id,
      event: 'update',
      attributes: doc
    }, 'update');
  }
})

module.exports = mongoose.model('Message', messageSchema);
