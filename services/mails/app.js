const fs = require('fs');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const Message = require('./models/mongoose/message');
const config = require('./configs');
const _ = require('lodash');
const messagesConsumer = require('./consumer/messages');
const topicsConsumer = require('./consumer/topics');
const vault = require('./services/vault');
const nylasService = require('./services/nylas');


const DEFAULT_NAMED_FOLDERS = [
  'all',
  'drafts',
  'important',
  'inbox',
  'sent',
  'spam',
  'trash',
];


mongoose.Promise = global.Promise;
mongoose.connection.openUri(config.mongodb.topics.url);



const consumers = {
  messages: messagesConsumer(config.rabbitmq, vault),
  topics: topicsConsumer(config.rabbitmq, vault)
}

Date.prototype.isValid = function () {
  return !isNaN(this.getTime());
};

const decryptionErrorHandler = (messages) => {
  const replaceMessageTexts = (message) => {
    if (message.encrypted) {
      message.body = 'Unable to decrypt message at the moment. Please try again later';
      message.snippet = 'Unable to decrypt message at the moment. Please try again later';
      message.subject = 'Unable to decrypt message at the moment. Please try again later';
    }
    return message;
  }

  if (!Array.isArray(messages)) {
    return replaceMessageTexts(messages);
  }
  return messages.map(replaceMessageTexts);
}

const app = express();
app.use(bodyParser.json());


const cancelControllers = require('./controllers/cancel');

app.delete('/api/messages', cancelControllers.delete);


app.get('/api/topics/:topic/contacts', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is not specified'})
    return;
  }

  Message.aggregate([
    {$match: {
      'accountId': req.query.account_id,
      'topics.name': req.params.topic,
      'deleted': {$ne: true}
    }},
    {$unwind: '$participants'},
    {$group: {'_id': {name: '$participants.name', email: '$participants.email'}, 'total': {$sum: 1}}},
    {$sort: {total: -1}},
    {$group: {'_id': null, 'total': {$sum: 1}, 'contacts': {$push: '$$ROOT'}}},
    {$project: {
      'total': 1,
      'contacts': {$slice: [
        '$contacts',
        parseInt(req.query.offset) || 0,
        parseInt(req.query.limit) || 20
      ]}}
    }
  ],
  (err, response) => {
    if(err) {
      console.log(err);
      return res.json({success: false, error: err});
    }
    if (response.length > 0) {
      return res.json({success: true, connections: response[0].contacts.map(contact => contact._id), total: response[0].total});
    } else {
      return res.json({success: true, connections: [], total: 0});
    }
  });
});

app.get('/api/topics-map/', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  let match = {
    'accountId': req.query.account_id,
    'topics': {'$ne': null},
    'deleted': {$ne: true}
  };

  if( req.query.from_date && req.query.to_date) {
    match['date'] = {'$and': [
      {'$gt': new Date(parseInt(req.query.from_date))},
      {'$lt': new Date(parseInt(req.query.to_date))}
    ]};
  }
  else if (req.query.from_date) {
    match['date'] = {'$gt': new Date(parseInt(req.query.from_date))};
  }
  else if (req.query.to_date) {
    match['date'] = {'$lt': new Date(parseInt(req.query.to_date))};
  }

  if (req.query.topic && req.query.topic !== '') {
    match['topics.name'] = req.query.topic;
  }

  if (req.query.email && req.query.email !== '') {
    match['participants.email'] = req.query.email;
  }

  if (!req.query.include_deleted) {
    match['labels.name'] = {'$ne': 'trash'};
  }

  Message.aggregate([
    {$match: match},
    {$unwind: '$topics'},
    {$group: {'_id': '$topics.name', 'count': {'$sum': 1}}},
    {$sort: {'count': -1}},
    {$limit: parseInt(req.query.limit) || 20}
  ],
  (err, response) => {
    if(err) {
      console.log(err);
      return res.json({success: false, error: err});
    }
    return res.json({success: true, topics: response.map((topic => {return {name: topic._id, count: topic.count}}))});
  })
})

app.get('/api/counters/:topic', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  var agg = [
    {$unwind: '$labels'},
    {$match: {'accountId' : req.query.account_id, 'deleted': {$ne: true}}},
    {$match: {'topics.name' : req.params.topic}},
    {$group: {
      _id: '$labels.id',
      count:{$sum: 1},
      name: {'$first': '$labels.name'},
      unread_count: {$sum: {$cond: ['$unread', 1, 0]}}}
    }
  ];

  Message.aggregate(agg, (err, response) => {
      if(err) return res.json({ success: false, error: err })
      return res.json({ success: true, data: response })
    });
})

app.get('/api/messages/:id/topics', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  Message.findOne({accountId: req.query.account_id, messageId: req.params.id, deleted: {$ne: true}})
    .then(vault.decryptMessage).then(decryptionErrorHandler)
    .then(message => {
      if (!message) {
        return Promise.reject({message: 'message_not_found'});
      }

      if (!message.topics || message.topics.length < 1 || req.query.force_process) {
        return consumers.topics.processTopics({
          object: 'message',
          event: 'create',
          attributes: {
            id: message.messageId,
            account_id: message.accountId,
            from: [message.from],
            to: message.to,
            cc: message.cc,
            body: message.body,
            date: message.date,
            files: message.files
          }
        })
        .then(() => {
          return Message.findOne({accountId: req.query.account_id, messageId: req.params.id})
            .then(message => Promise.resolve(message.topics))
        })
      } else {
        return Promise.resolve(message.topics)

      }
    })
    .then(topics => {
      res.json({success: true, topics: topics.map(topic => {
        return {name: topic.name, offsets: topic.htmlOffsets}
      })});
    })
    .catch(err => {
      if (err.message == 'message_not_found') {
        res.status(404).json({success: false, error: err.message});
      } else {
        res.status(500).json({success: false, error: err.message});
      }
    })
});

app.post('/api/messages/:id/topics', (req, res) => {
  if (!req.query.account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  if(!req.body.topics) {
    return res.status(400).json({success: false, error: 'topics are missed'});
  }

  Message.findOne({accountId: req.query.account_id, messageId: req.params.id}, {topics: 1})
    .then(topics => {
      let newTopics = req.body.topics
        .filter(topic => !topics.topics.some(existingTopic => topic.name === existingTopic.name))
        .map(topic => {
          topic.source = 'user';
          return topic;
        });
      if (newTopics.length > 0){
        return Message.findOneAndUpdate({accountId: req.query.account_id, messageId: req.params.id},{
          $push: { topics: { $each: newTopics } }
        })
      }
      return Promise.resolve(true);
    })
    .then(() => {
      res.status(200).json({success: true});
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({success: false, error: err.message});
    })
});

app.get('/api/messages/:id/topics/annotations', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  Message.findOne({accountId: req.query.account_id, messageId: req.params.id}, {topicsAnnotations: 1, textShared: 1})
    .then(annotations => {
      res.status(200).json({success: true, annotations: annotations.topicsAnnotations, shareText: annotations.textShared});
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({success: false, error: err.message});
    })
});

app.post('/api/messages/:id/topics/annotations', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  if (!req.body.annotations) {
    return res.status(400).json({success: false, error: 'annotations are missed'});
  }

  Message.findOneAndUpdate({accountId: req.query.account_id, messageId: req.params.id},
    {
      $set: {
        "topicsAnnotations": _.uniqBy(req.body.annotations, 'name'),
        "textShared": req.body.shareText
      },
    })
    .then(() => {
      res.status(200).json({success: true});
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({success: false, error: err.message});
    })
});

app.get('/api/messages', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  let promises = [];
  let messages = {
    count: 0,
    messages: []
  }
  let totalRecords = parseInt(req.query.limit);
  let startIndex = parseInt(req.query.offset);
  let orderBy = req.query.order;
  let order = {};
  let filter = {
    accountId: req.query.account_id,
    deleted: {$ne: true},
    pinned: {$ne: true}
  }

  if (req.query.from) {
    filter['from.email'] = req.query.from;
  }

  if (req.query.thread_id) {
    filter['threadId'] = req.query.thread_id;
  }

  if (req.query.folder) {
    if (DEFAULT_NAMED_FOLDERS.includes(req.query.folder)) {
      filter['labels.name'] = req.query.folder;
    } else {
      filter['labels.id'] = req.query.folder;
    }
  }

  if (req.query.email) {
    filter['participants.email'] = req.query.email;
  }

  if (req.query.topic) {
    filter['topics.name'] = req.query.topic
  }

  if (!req.query.include_deleted && !req.query.folder) {
    filter['labels.name'] = {'$ne': 'trash'};
  }

  if(req.query.starred) {
    filter['starred'] = req.query.starred === "true";
  }

  if(req.query.pinned) {
    filter['pinned'] = req.query.pinned === "true";
  }

  switch (orderBy) {
    case 'subject':
      order['subject'] = 1;
      order['date'] = -1;
      break;
    case 'sender':
      order['from.email'] = 1;
      order['date'] = -1;
      break;
    case 'thread':
      order['threadId'] = 1;
      order['date'] = -1;
      break;
    case 'attachments':
      order['files'] = 1;
      order['date'] = -1;
      break;
    default:
      order['date'] = -1;
      break;
  }

  promises.push(
    Message.find(filter)
      .skip(startIndex)
      .limit(totalRecords)
      .sort(order)
      .then(vault.decryptMessages).then(decryptionErrorHandler)
      .then(data => {
        messages.messages = data
      })
  )

  promises.push(Message.find(filter)
    .sort(order)
    .count()
    .then(data => {
      messages.count = data;
    }))

  Promise.all(promises)
    .then(() => {
      res.status(200).json(messages)
    })
    .catch(err => {
      console.log(err);
      res.status(400).json({success: false, error: err})
    })
});

app.get('/api/messages/:id', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }
  Message.findOne({
    accountId: req.query.account_id,
    messageId: req.params.id
  })
  .then(vault.decryptMessages).then(decryptionErrorHandler)
  .then((message) => {
    res.status(200).json({success: true, message: message})
  })
  .catch(err => {
    console.log(err);
    res.status(400).json({success: false, error: err});
  })
});

app.get('/api/latest-messages', (req, res) => {

  let totalRecords = parseInt(req.query.limit)||20;
  let account_id = req.query.account_id;


  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  let filter = {
    accountId: account_id,
    deleted: {$ne: true},
    pinned: {$ne: true}
  }

  if (req.query.folder) {
    if (DEFAULT_NAMED_FOLDERS.includes(req.query.folder)) {
      filter['labels.name'] = req.query.folder;
    } else {
      filter['labels.id'] = req.query.folder;
    }
  }

  if (!req.query.include_deleted && !req.query.folder) {
    filter['labels.name'] = {'$ne': 'trash'};
  }

  let date_after = new Date(parseInt(req.query.date_after))

  if (date_after.isValid()) {
    filter['date'] = {$gt: date_after};
    Message.find(filter)
        .sort({date: 1})
        .limit(totalRecords)
        .then(vault.decryptMessages).then(decryptionErrorHandler)
        .then(data => {
          _.sortBy(data,['date'],['desc']);
          res.status(200).json(data);
        });
  }
});

// *** Knowledge Graph endpoints ***

const getMatchFilter = (filters) => {
  let match = {'$and': [{
    'accountId': filters.accountId,
    'labels.name': {'$nin': ['trash', 'sent', 'draft']},
    'deleted': {$ne: true}
  }]};

  if (filters.contactEmail && filters.contactName) {
    match['$and'].push({'participants.email': filters.contactEmail, 'participants.name': filters.contactName});
  } else if (filters.contactEmail) {
    match['$and'].push({'participants.email': filters.contactEmail});
  } else if (filters.contactName) {
    match['$and'].push({'participants.name': filters.contactName});
  }

  if (filters.relatedTopic) {
    match['$and'].push({'topics.name': filters.relatedTopic});
  }

  if (filters.relatedContactEmail && filters.relatedContactName) {
    match['$and'].push({'participants.email': filters.relatedContactEmail, 'participants.name': filters.relatedContactName});
  } else if (filters.relatedContactEmail) {
    match['$and'].push({'participants.email': filters.relatedContactEmail});
  } else if (filters.relatedContactName) {
    match['$and'].push({'participants.name': filters.relatedContactName});
  }

  if (filters.topic) {
    match['$and'].push({'topics.name': filters.topic});
  } else if (filters.topics) {
    match['$and'].push({'topics.name': {'$in': filters.topics}});
  } else if (filters.messageId) {
    return Message.findOne({messageId: filters.messageId})
      .then(message => {
        if(message.topics) {
          match['$and'].push({'topics.name': {'$in': message.topics.map(topic => topic.name)}});
        }
        return Promise.resolve(match);
      })
  }
  return Promise.resolve(match);
}

app.get('/api/knowledge-graph/files/:type', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  let contentTypeSelector;

  switch (req.params.type) {
    case 'images':
      contentTypeSelector = /^image\//;
      break;
    case 'videos':
      contentTypeSelector = /^video\//;
      break;
    case 'documents':
      contentTypeSelector = /^application\//;
      break;
    case 'allTypes':
      contentTypeSelector = '';
      break;
    default:
      console.log('Incorrect file type:', req.params.type);
      return res.status(400).json({success: false, error: 'file type is incorrect'});
  }

  getMatchFilter({
    'accountId': req.query.account_id,
    'contactEmail': req.query.contact_email,
    'contactName': req.query.contact_name,
    'topic': req.query.topic,
    'messageId': req.query.message_id,
    'relatedTopic': req.query.related_topic,
    'relatedContactEmail': req.query.related_contact_email,
    'relatedContactName': req.query.related_contact_name,
  }).then(match => {
    if(contentTypeSelector !== '') {
      match['files.content_type'] = contentTypeSelector;
    }
    const query = [
      {$match: match},
      {$unwind: '$files'},
    ];
    if(contentTypeSelector) {
      query.push({$match: {'files.content_type': contentTypeSelector}});
    }
    const defaultQuery = [
      {$sort: {'date': -1}},
      {$project: {
        'id': '$files.id',
        'size': '$files.size',
        'filename': '$files.filename',
        'content_type': '$files.content_type',
        'content_id': '$files.content_id'
      }},
      // get total, AND preserve the results
      {$group: {'_id': null, 'total': {$sum: 1}, 'files': {$push: '$$ROOT'}}},
      // apply limit and offset
      {$project: {
        'total': 1,
        'files': {$slice: [
          '$files',
          parseInt(req.query.offset) || 0,
          parseInt(req.query.limit) || 20
        ]}}
      }
    ];
    Message.aggregate(_.concat(query, defaultQuery),
    (err, response) => {
      if(err) {
        console.log(err);
        return res.json({success: false, error: err});
      }
      if (response.length > 0) {
        return res.json({success: true, files: response[0].files, total: response[0].total});
      } else {
        return res.json({success: true, files: [], total: 0});
      }
    })
  });
});

app.get('/api/knowledge-graph/connections', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  getMatchFilter({
    'accountId': req.query.account_id,
    'contactEmail': req.query.contact_email,
    'contactName': req.query.contact_name,
    'topic': req.query.topic,
    'messageId': req.query.message_id,
    'relatedTopic': req.query.related_topic,
  }).then(match => {
    const ignoreEmails = [req.query.contact_email, req.query.ignore_contact_email].filter(email => !!email);
    Message.aggregate([
      {$match: match},
      {$unwind: '$participants'},
      {$match:{
        'participants.email': {$nin: ignoreEmails}
      }},
      {$group: {
        '_id': '$participants.email',
        'contact': {$first: {name: '$participants.name', email: '$participants.email'}},
        'count': {'$sum': 1}
      }},
      {$sort: {'count': -1}},
      // get total, AND preserve the results
      {$group: {'_id': null, 'total': {$sum: 1}, 'connections': {$push: '$$ROOT'}}},
      // apply limit and offset
      {$project: {
        'total': 1,
        'connections': {$slice: [
          '$connections',
          parseInt(req.query.offset) || 0,
          parseInt(req.query.limit) || 20
        ]}}
      }
    ])
    .exec()
    .then(response => {
      if (response.length > 0) {
        return res.json({
          success: true,
          connections: response[0].connections.map((connection => {return connection.contact})),
          total: response[0].total
        });
      } else {
        return res.json({success: true, connections: [], total: 0});
      }
    })
    .catch(err => {
      console.log(err);
      return res.json({success: false, error: err});
    })
  });
});

app.get('/api/knowledge-graph/topics', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  let messageTopicsPromise = Promise.resolve(null);
  let messageTopics = [];
  if (req.query.message_id) {
    messageTopicsPromise = Message.findOne({messageId: req.query.message_id})
      .then(message => {
        if(message.topics) {
          messageTopics = message.topics.map(topic => topic.name);
          return Promise.resolve(messageTopics);
        }
        return Promise.resolve(null);
      })
  }

  messageTopicsPromise.then(topics => {
    return getMatchFilter({
      'accountId': req.query.account_id,
      'contactEmail': req.query.contact_email,
      'contactName': req.query.contact_name,
      'topic': req.query.topic,
      'topics': req.topics,
      'messageId': req.query.message_id,
    })
  }).then(match => {
    Message.aggregate([
      {$match: match},
      {$unwind: '$topics'},
      {$match: {'topics.name': {'$nin': messageTopics}}},
      {$group: {'_id': '$topics.name', 'count': {'$sum': 1}}},
      {$sort: {'count': -1}},
      // get total, AND preserve the results
      {$group: {'_id': null, 'total': {$sum: 1}, 'topics': {$push: '$$ROOT'}}},
      // apply limit and offset
      {$project: {
        'total': 1,
        'topics': {$slice: [
          '$topics',
          parseInt(req.query.offset) || 0,
          parseInt(req.query.limit) || 20
        ]}}
      }
    ])
    .exec()
    .then(response => {
      if (response.length > 0) {
        return res.json({
          success: true,
          topics: response[0].topics.map((topic => {return topic._id})),
          total: response[0].total
        });
      } else {
        return res.json({success: true, topics: [], total: 0});
      }
    })
    .catch(err => {
      console.log(err);
      return res.json({success: false, error: err});
    });
  });
});

app.get('/api/knowledge-graph/messages', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  let order = {};
  switch (req.query.mail_order) {
    case 'subject':
      order['subject'] = 1;
      order['date'] = -1;
      break;
    case 'sender':
      order['from.email'] = 1;
      order['date'] = -1;
      break;
    case 'thread':
      order['threadId'] = 1;
      order['date'] = -1;
      break;
    case 'attachments':
      order['files'] = 1;
      order['date'] = -1;
      break;
    default:
      order['date'] = -1;
      break;
  }

  getMatchFilter({
    'accountId': req.query.account_id,
    'contactEmail': req.query.contact_email,
    'contactName': req.query.contact_name,
    'topic': req.query.topic,
    'messageId': req.query.message_id,
    'relatedTopic': req.query.related_topic,
    'relatedContactEmail': req.query.related_contact_email,
    'relatedContactName': req.query.related_contact_name,
    'mailOrder': req.query.mail_order
  }).then(match => {
    let promises = [];

    promises.push(
      Message.find(match)
        .sort(order)
        .skip(parseInt(req.query.offset) || 0)
        .limit(parseInt(req.query.limit) || 20)
        .then(vault.decryptMessages).then(decryptionErrorHandler)
    )

    promises.push(Message.find(match).count())

    Promise.all(promises)
      .then(data => {
        res.status(200).json({messages: data[0], count: data[1]})
      })
      .catch(err => {
        console.log(err);
        res.status(400).json({success: false, error: err})
      })
  });
});

// *** End Contacts/Knowladge Pane endpoints ***


app.get('/api/message/star/count', (req, res) => {

  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }
  Message.aggregate([
    {
      $match: {
        'accountId': req.query.account_id,
        'starred': true,
        'deleted': {$ne: true}
      }
    },
    {
      $group: {
        _id: {starred: '$starred'},
        count: {$sum: 1},
        unread_count: {$sum: {$cond: ['$unread', 1, 0]}}
      }
    }
  ])
    .then(response => {
      if(response && response[0])
        res.status(200).json(response[0]) ;
      else
        res.status(200).json({
          "count": 0,
          "unread_count": 0
        });
    })
    .catch(err => {
        res.status(404).json({success: false, error: err.msg});
    })
});


app.delete('/api/messages/:id', (req, res) => {

  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  Message.findOneAndUpdate({accountId: req.query.account_id, messageId: req.params.id},
    {
      $set: {"deleted": true},
    })
    .then(message => {
      res.status(200).json(message);
    })
    .catch(err => {
      res.status(404).json({success: false, error: err.msg});
    })
});

app.post('/api/mail/messages/send', (req, res) => {
  if (!req.query.account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const message = req.body.message;
  const user = req.body.user;

  return nylasService.sendMessage(message, user)
    .then(data => {
      const result = {
        message: data
      };
      return res.json({success: true, data: result});
    })
    .catch(error => {
      return res.status(500).json({success: false, error: error})
    });
});

app.get('/api/folders/counts', (req, res) => {

  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  let matchFirst = [{
    accountId: req.query.account_id,
    deleted: {$ne: true}
  }];

  let matchSecond={};

  if (req.query.folder) {
    if (DEFAULT_NAMED_FOLDERS.includes(req.query.folder)) {
      matchFirst.push({
        'labels.name': req.query.folder
      });
      matchSecond = {
          'labels.name': req.query.folder
      };
    } else {
      matchFirst.push({
        'labels.id': req.query.folder
      });
      matchSecond = {
        'labels.id': req.query.folder
      };
    }
  }

  Message.aggregate([
    {
      $match: {
        $and: matchFirst
      }
    },
    {
      $unwind: "$labels"
    },
    {
      $match:matchSecond
    },
    {
      $group: {
        _id: '$labels.id',
        count: {$sum: 1},
        name: {'$first': '$labels.name'},
        unread_count: {$sum: {$cond: ['$unread', 1, 0]}},
      }
    }
  ]).exec().then(response => {

    res.json(response).status(200)

  }).catch(err => {
    console.log(err);
    res.status(400).json({success: false, error: err})
  })

});

app.put('/api/message/:id/pinned', (req, res) => {

  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  Message.findOneAndUpdate({accountId: req.query.account_id, messageId: req.params.id},
    {
      $set: {"pinned": req.body.pinned},
    })
    .then(message => {
      res.status(200).json(message);
    })
    .catch(err => {
      res.status(404).json({success: false, error: err.msg});
    })
});

app.put('/api/messages/:id', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  let body = {};

  if (!req.body) {
    res.status(400).json({success: false, error: 'body is missed'});
    return;
  }

  if(req.body.replied) {
    body['replied'] = true
  }
  if(req.body.forwarded) {
    body['forwarded'] = true
  }

  if(body['replied'] || body['forwarded']) {
    Message.findOneAndUpdate({accountId: req.query.account_id, messageId: req.params.id},
      {
        $set: body,
      })
      .then(message => {
        res.status(200).json(message);
      })
      .catch(err => {
        res.status(404).json({success: false, error: err.msg});
      })
  }
});
vault.prepare()
  // .then(() => {
  //   return vault.vault.write('transit/encrypt/user_id_1', {
  //     batch_input: [
  //       {plaintext: new Buffer.from('Hello World!').toString('base64')},
  //       {plaintext: new Buffer.from('Hello World!2').toString('base64')},
  //       {plaintext: new Buffer.from('Hello World!3').toString('base64')}
  //     ]
  //   })
  // })
  // .then(result => {
  //   console.log(result.data);
  //   return vault.vault.write('transit/decrypt/user_id_1', {
  //     batch_input: [
  //       {ciphertext: result.data.batch_results[0].ciphertext},
  //       {ciphertext: result.data.batch_results[1].ciphertext},
  //       {ciphertext: result.data.batch_results[2].ciphertext}
  //     ]
  //   })
  // })
  // .then(result => {
  //   console.log(new Buffer(result.data.batch_results[0].plaintext, 'base64').toString('ascii'));
  //   console.log(new Buffer(result.data.batch_results[1].plaintext, 'base64').toString('ascii'));
  //   console.log(new Buffer(result.data.batch_results[2].plaintext, 'base64').toString('ascii'));
  //   return Promise.resolve(true)
  // })
  .then(() => {

    https.createServer({
      key: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-server.key.pem`),
      cert: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-server.crt.pem`),
      ca: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-root-ca.crt.pem`),
      requestCert: false,
      rejectUnauthorized: true,
    }, app).listen(3004, function () {
      console.log('Mail micro-service listening on port 3004!');
    });

    consumers.messages.consume();
    consumers.topics.consume();
  })
  .catch(err => {
    console.error('Service can\'t be started without Vault');
    console.log(err);
  })
