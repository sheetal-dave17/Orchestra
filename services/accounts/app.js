const fs = require('fs');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const _ = require('lodash');

const config = require('./configs');

const AutoReply = require('./models/mongoose/auto-reply');
const Signature = require('./models/mongoose/signature');
const DelayedSend = require('./models/mongoose/delayed-send');
const QuickReplyTemplate = require('./models/mongoose/quick-reply-template');
const WaitingList = require('./models/mongoose/waiting-list');

const autoRepliesCache = require('./services/auto-replies-cache');
const vault = require('./services/vault');

mongoose.Promise = global.Promise;

mongoose.connection.openUri(config.mongoDB);


const autoRepliesConsumer = require('./consumer/auto-replies');
const mailRulesConsumer = require('./consumer/mail-rules');

const consumers = {
  autoReplies: autoRepliesConsumer(config.rabbitmq),
  mailRules: mailRulesConsumer(config.rabbitmq),
};


const app = express();
app.use(bodyParser.json());


const mailRules = require('./controllers/mail-rules');
const cancelControllers = require('./controllers/cancel');

app.get('/api/account/mail-rules', mailRules.getAll);
app.get('/api/account/mail-rules/:id', mailRules.get);
app.post('/api/account/mail-rules', mailRules.post);
app.put('/api/account/mail-rules/:id', mailRules.put);
app.delete('/api/account/mail-rules/:id', mailRules.delete);

app.delete('/api/account', cancelControllers.delete);


app.get('/api/account/signatures', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  Signature.find({
    accountId: req.query.account_id
  }).then((result) => {
    let signatures = result.map(signature => {
      return {
        id: signature._id,
        title: signature.title,
        content: signature.content,
        isDefault: signature.isDefault
      }
    });
    res.status(200).json({success: true, signatures: signatures})
  })
  .catch(err => {
    console.log(err);
    res.status(400).json({success: false, error: err});
  })
});

app.post('/api/account/signatures', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  if (!req.body.content) {
    res.status(400).json({success: false, error: 'content is missed'});
    return;
  }

  if (!req.body.title) {
    res.status(400).json({success: false, error: 'title is missed'});
    return;
  }

  const signature = new Signature({
    accountId: req.query.account_id,
    title: req.body.title,
    content: req.body.content
  })

  signature.save().then(signature => {
    res.status(200).json({ success: true, data: {
      id: signature._id,
      title: signature.title,
      content: signature.content,
      isDefault: signature.isDefault
    }});
  }).catch(err => res.status(400).json({ success: false, error: err }));
});

app.put('/api/account/signatures/:id', (req, res) => {
  if (!req.query.account_id) {
    res.status(400).json({success: false, error: 'account_id is missed'});
    return;
  }

  let updatedSignature = { accountId: req.query.account_id };

  if (req.body.content) {
    updatedSignature.content = req.body.content;
  }

  if (req.body.title) {
    updatedSignature.title = req.body.title;
  }

  let performUpdate = () => {
    if (req.body.isDefault) {
      return Signature.update(
        { accountId: req.query.account_id},
        { isDefault: false },
        { multi: true }
      )
    } else {
      return Promise.resolve({})
    }
  }

  performUpdate().then(result => {
    if (result.hasOwnProperty('ok')) {
      updatedSignature.isDefault = req.body.isDefault;
    }
    return Signature.findOneAndUpdate(
      { accountId: req.query.account_id,
        _id: req.params.id },
      updatedSignature,
      { upsert: true }
    )
  })
  .then(signature => {
    res.status(200).json({ success: true, data:{
      id: signature._id,
      title: signature.title,
      content: signature.content,
      isDefault: signature.isDefault
    }})
  })
  .catch(err => {
    console.log(err);
    res.status(400).json({success: false, error: err});
  });
});

app.delete('/api/account/signatures/:id', (req, res) => {
    if (!req.query.account_id) {
      return res.status(400).json({success: false, error: 'account_id is missed'});
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({success: false, error: 'must provide a valid id'})
    }

    const conditions = {
      _id: req.params.id,
      accountId: req.query.account_id
    };

    Signature.findOneAndRemove(conditions)
      .then(signature => {
        return res.status(200).json({ success: true });
      })
      .catch(err => {
        console.error(err);
        return res.status(400).json({ success: false, error: err });
      });
});

app.get('/api/account/auto-reply', (req, res) => {
  if (!req.query.account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  AutoReply.findOne({
    accountId: req.query.account_id
  })
    .then((data) => {
      const result = {
        dateFrom: null,
        dateTo: null,
        content: '',
        enabled: false,
      };

      if (data) {
        result.dateFrom = data.dateFrom;
        result.dateTo = data.dateTo;
        result.content = data.content;
        result.enabled = !!data.enabled;
      }

      return res.status(200).json({success: true, autoReply: result})
    })
    .catch(error => {
      console.error(error);
      return res.status(500).json({success: false, error: error});
    })
});

app.post('/api/account/auto-reply', (req, res) => {
  const accountId = req.query.account_id;

  if (!accountId) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  AutoReply.findOneAndUpdate(
    {accountId: accountId},
    {
      accountId: accountId,
      content: req.body.content,
      dateFrom: req.body.dateFrom,
      dateTo: req.body.dateTo,
      enabled: req.body.enabled,
    },
    { upsert: true }
  )
    .then(() => {
      autoRepliesCache.invalidateByAccountId(accountId);
      return res.status(200).json({success: true});
    })
    .catch(error => {
      console.error(error);
      return res.status(500).json({success: false, error: error});
    })
});

app.get('/api/account/delayed-send', (req, res) => {
  if (!req.query.account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  DelayedSend.findOne({
    accountId: req.query.account_id
  })
    .then((result) => {
      const enabled = result && result.enabled;
      res.status(200).json({success: true, enabled: enabled})
    })
    .catch(error => {
      console.error(error);
      res.status(400).json({success: false, error: error});
    })
});

app.post('/api/account/delayed-send', (req, res) => {
  if (!req.query.account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  DelayedSend.findOneAndUpdate(
    {
      accountId: req.query.account_id
    },
    {
      accountId: req.query.account_id,
      enabled: req.body.enabled,
    },
    {
      upsert: true
    }
  )
    .then(() => {
      return res.status(200).json({success: true});
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    })
});

app.get('/api/account/quick-reply-templates', (req, res) => {
  if (!req.query.account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const query = {
    accountId: req.query.account_id,
  };
  const sort = {
    _id: 1,
  };

  QuickReplyTemplate.find(query, {}, sort)
    .then(result => {
      const formattedResult = result.map(element => {
        return {
          id: element._id,
          content: element.content,
          title: element.title,
        };
      });

      return res.status(200).json({
        success: true,
        data: formattedResult,
      });
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    })
});

app.get('/api/account/quick-reply-templates/:id', (req, res) => {
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

  QuickReplyTemplate.findOne(conditions)
    .then(result => {
      if (!result) {
        return res.status(404).end();
      }

      return res.status(200).json({
        success: true,
        data: {
          id: result._id,
          content: result.content,
          title: result.title,
        }
      });
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    })
});

app.post('/api/account/quick-reply-templates', (req, res) => {
  if (!req.query.account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const content = req.body.content;
  if (!content) {
    return res.status(400).json({success: false, error: 'content is empty'});
  }

  const title = req.body.title;
  if (!title) {
    return res.status(400).json({success: false, error: 'title is empty'});
  }

  const quickReplyTemplate = new QuickReplyTemplate({
    accountId: req.query.account_id,
    content: content,
    title: title,
  });

  quickReplyTemplate.save(quickReplyTemplate)
    .then(() => {
      return res.status(200).json({success: true, data: {}});
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    });
});

app.put('/api/account/quick-reply-templates/:id', (req, res) => {
  if (!req.query.account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const content = req.body.content;
  if (!content) {
    return res.status(400).json({success: false, error: 'content is empty'});
  }

  const title = req.body.title;
  if (!title) {
    return res.status(400).json({success: false, error: 'title is empty'});
  }

  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({success: false, error: 'id is invalid'});
  }

  const conditions = {
    _id: id,
    accountId: req.query.account_id,
  };
  const doc = {
    content: content,
    title: title,
  };

  QuickReplyTemplate.update(conditions, doc)
    .then(result => {
      return res.status(200).json({success: true, data: {}});
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    });
});

app.delete('/api/account/quick-reply-templates/:id', (req, res) => {
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

  QuickReplyTemplate.remove(conditions)
    .then(result => {
      return res.status(200).json({success: true, data: {}});
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error});
    });
});

app.post('/api/waiting-list', (req, res) => {
  if (!req.body || !req.body.email) {
    return res.status(400).json({success: false, error: 'email is missed'});
  }

  WaitingList.findOneAndUpdate(
    { email: req.body.email },
    {
      email: req.body.email,
      name: req.body.name,
      familyName: req.body.family_name,
      givenName: req.body.given_name,
      gender: req.body.gender,
      link: req.body.link,
      homeDomain: req.body.hd,
      locale: req.body.locale,
      picture: req.body.picture,
      userId: req.body.user_id,
      verifiedEmail: req.body.verified_email
    },
    { upsert: true }
  )
  .then(() => res.status(200).json({success: true}))
  .catch(err => {
    console.error(err);
    return res.status(500).json({success: false, error: err});
  })
})


vault.prepare()
  .then(() => {
    https.createServer({
      key: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-server.key.pem`),
      cert: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-server.crt.pem`),
      ca: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-root-ca.crt.pem`),
      requestCert: false,
      rejectUnauthorized: true,
    }, app).listen(3006, function () {
      console.log('Accounts micro-service listening on port 3006!');
    });

    consumers.autoReplies.consume();
    consumers.mailRules.consume();
  })
  .catch(error => {
    console.error('Service can\'t be started without Vault');
    console.log(error);
  });
