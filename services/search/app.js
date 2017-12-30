const fs = require('fs');
const https = require('https');
const express = require('express');
const bodyParser = require('body-parser');

const config = require('./configs');
const es = require('./services/elasticsearch-old');
const vault = require('./services/vault');
const searchMessagesConsumer = require('./consumer/search-messages');
const searchTopicsConsumer = require('./consumer/search-topics');
const searchContactsConsumer = require('./consumer/search-contacts');

const consumers = {
  searchMessages: searchMessagesConsumer(config.rabbitmq, vault),
  searchTopics: searchTopicsConsumer(config.rabbitmq),
  searchContacts: searchContactsConsumer(config.rabbitmq),
}

const app = express();
app.use(bodyParser.json());

/**
 * Email search
 * Endpoint: /search/messages
 * Accepts POST request with JSON encoded body data.
 * Accepted fields in body:
 *
 * Required fields:
 *  accountId: Account of user
 *  query: Search string
 *
 * Optional fields:
 *  size: Number of returned hits
 *  from: Start position (for pagination)
 *  fields: Which fields in ES should be searched
 *  sort: Sort by date or by _score
 *  sort_order: sort asc or desc
 *  labels: Which folders / labels should be searched
 *  log_query: boolean, should the query be logged?
 */
app.post('/search/messages', (req, res) => {
  es.messages(req.body)
    .then(hits => res.send(hits).end())
    .catch(err => {
      console.error(err);
      res.status(500).send(err.message).end();
    });
});

/**
 * Contacts search
 * Endpoint: /search/contacts
 * Accepts POST request with JSON encoded body data.
 * Accepted fields in body:
 *
 * Required fields:
 *  accountId: Account of user
 *
 * Optional fields:
 *  query: Search string
 *  size: Number of returned hits
 *  from: Start position (for pagination)
 *  fields: Which fields in ES should be searched
 *  sort: Sort by name, email, or email_count
 *  sort_order: sort asc or desc
 */
app.post('/search/contacts', (req, res) => {
  es.contacts(req.body)
    .then(hits => res.send(hits).end())
    .catch(err => {
      console.error(err);
      res.status(500).send(err.message).end();
    });
});

/**
 * Files search
 * Endpoint: /search/files
 * Accepts POST request with JSON encoded body data.
 * Accepted fields in body:
 *
 * Required fields:
 *  accountId: Account of user
 *
 * Optional fields:
 *  query: Search string
 *  size: Number of returned hits
 *  from: Start position (for pagination)
 *  fields: Which fields in ES should be searched
 *  sort: Sort by filename, date
 *  sort_order: sort asc or desc
 */
app.post('/search/files', (req, res) => {
  const body = Object.assign(req.body, {fields: ['files.filename']});
  es.messages(req.body)
    .then(hits => res.send(hits).end())
    .catch(err => {
      console.error(err);
      res.status(500).send(err.message).end();
    });
});


/**
 * History search
 * Endpoint: /search/history
 * Accepts POST request with JSON encoded body data.
 * Accepted fields in body:
 *
 * Required fields:
 *  accountId: Account of user
 *
 * Optional fields:
 *  query: Search string
 *  size: Number of returned hits
 *  from: Start position (for pagination)
 *  sort: Sort by query, date
 *  sort_order: sort asc or desc
 */
app.post('/search/history', (req, res) => {
  es.history(req.body)
    .then(hits => res.send(hits).end())
    .catch(function(err) {
      console.error(err);
      res.status(500).send(err.message).end();
    });
});

/**
 * Topics search
 * Endpoint: /search/topics
 * Accepts POST request with JSON encoded body data.
 * Accepted fields in body:
 *
 * Required fields:
 *  accountId: Account of user
 *
 * Optional fields:
 *  query: Search string
 *  size: Number of returned hits
 *  from: Start position (for pagination)
 *  fields: Which fields in ES should be searched
 *  sort: Sort by name, email, or email_count
 *  sort_order: sort asc or desc
 */
app.post('/search/topics', (req, res) => {
  es.topics(req.body)
    .then(hits => res.send(hits).end())
    .catch(err => {
      console.error(err)
      res.status(500).send(err.message).end();
    });
});

/**
 * Suggestions
 * Endpoint: /suggest
 * Accepts POST request with JSON encoded body data.
 * Accepted fields in body:
 *  accountId: Account of user
 *  query: Search string
 */
app.post('/suggest', (req, res) => {
  const es_args = {
    accountId: req.body.accountId,
    query: req.body.query,
    size: 5
  };

  var es_queries = [];

  //Contacts
  es_queries.push(es.contacts(es_args).then(r => {return {"contacts": r}}));

  //Topics
  es_queries.push(es.topics(es_args).then(r => {return {"topics": r}}));

  //History
  es_queries.push(es.history(es_args).then(r => {return {"history": r}}));

  //Subjects
  // es_queries.push(es.messages(Object.assign({}, es_args, {fields: ['subject']})).then(r => {return {"messages": r}}));

    //var es_queries = [es1, es2];
  Promise.all(es_queries)
    .then(function(data) {
      var output = {};
      for(entry of data) {
        Object.assign(output, entry);
      }
      res.send(output).end();
    })
    .catch(err => {
      console.error(err);
      res.status(500).send(err.message).end();
    })
});

vault.prepare()
  .then(() => {
    https.createServer({
      key: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-server.key.pem`),
      cert: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-server.crt.pem`),
      ca: fs.readFileSync(`${__dirname}/${config.sslDirectory}my-root-ca.crt.pem`),
      requestCert: false,
      rejectUnauthorized: true,
    }, app).listen(3008, function () {
      console.log('Search micro-service listening on port 3008!');
    });

    consumers.searchMessages.consume();
    consumers.searchTopics.consume();
    consumers.searchContacts.consume();
  })
  .catch(err => {
    console.error('Service can\'t be started without Vault');
    console.log(err);
  })
