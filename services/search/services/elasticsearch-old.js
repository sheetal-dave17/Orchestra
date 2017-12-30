// @TODO Refactor this module. Copied as is from stitch-search repo with small changes.

const md5 = require('md5');
const elasticsearch = require('elasticsearch');

const config = require('../configs');


// Constructor
function ElasticSearch() {
  // ES client
  this.client = new elasticsearch.Client({
    host: config.elasticsearch.host,
    httpAuth: config.elasticsearch.auth,
    requestTimeout: config.elasticsearch.requestTimeout,
  });
}

/**
 * Checks the response, that not from different accounts are returned.
 * !! Important: Should always be called before data is returned !!
 */
ElasticSearch.prototype.check_response = function(accountId, data) {
  for(entry of data) {
    if(!('accountId' in entry) || entry['accountId'] != accountId) {
      return false;
    }
    delete entry['accountId'];
  }
  return true;
}


/**
 * Search for messages
 */
ElasticSearch.prototype.messages = function({accountId: accountId = null, query=null, sort='_score', sortOrder='desc', size=20, from=0, fields=[], labels=[], log_query=true} = {}) {
  var self = this;
  return new Promise(function(resolve, reject) {
    //Account id that should be searched (parameter: accountId)
    if ( typeof accountId === 'undefined' || !accountId ) {
      reject(Error('Please provide an accountId'));
      return;
    }

    //Search query (parameter: query)
    if ( typeof query === 'undefined' || !query ) {
      reject(Error('Please provide a query'));
      return;
    }

    //Number of results (parameter: size)
    size = parseInt(size);
    if ( size < 1 || size > 100 ) {
      reject(Error('Size parameter must be between 1 and 100'));
      return;
    }

    // Pagination support (parameter: from)
    if ( from < 0 ) {
      reject(Error('Invalid from value'));
      return;
    }

    //Which elasticsearch fields should be searched (parameter: fields)
    var allowed_fields = {'subject.ngrams':true, 'bodyText.ngrams':true, 'files.filename.ngrams':true};
    for(email_field of ['from', 'to', 'cc', 'bcc']) {
        //allowed_fields[email_fields[i]+'.name'] = true;
        //allowed_fields[email_fields[i]+'.email'] = true;
        allowed_fields[email_field+'.name.ngrams'] = true;
        allowed_fields[email_field+'.email.ngrams']   = true;
      }

      var default_fields = [  'subject', 'bodyText', 'files.filename',
      'from.name', 'from.email', 'to.name', 'to.email',
      'cc.name','cc.email'];

      if(fields.length == 0) {
        fields = default_fields;
      }

    // Add .ngrams to the fields
    fields = fields.map(function(x) { return x+'.ngrams'}, fields);

    if(!Array.isArray(fields) || !fields.every(elem => elem in allowed_fields)) {
      reject(Error('Fields list contained illegal value'));
      return;
    }


    // Sorting (parameter: sort)
    var allowed_sort = {'date': true, '_score': true}
    if(!(sort in allowed_sort)) {
      reject(Error('Invalid sort value'));
      return;
    }

     // Sorting order (parameter: sortOrder)
     var allowed_sortOrder = {'desc': true, 'asc': true}
     if(!(sortOrder in allowed_sortOrder)) {
      reject(Error('Invalid sortOrder value'));
      return;
    }

    // Labels that should be searched
    if(!Array.isArray(labels) || !labels.every(elem => typeof elem === 'string')) {
      reject(Error('Invalid labels value'));
      return;
    }


    // All parameters where checked, now construct the ES query
    // Construct the filtering. Filter by accountId and (if specified) by labels
    var filter_query = {must: {
      term: {accountId: accountId}
    }};

    if(labels.length > 0) {
      filter_query['should'] = [];

      for(var i=0;i<labels.length; i++) {
        filter_query['should'].push({'term': {'labels': labels[i]}});
      }
    }

    // Log the query
    if(log_query) {
      self.log_query(accountId, query);
    }

    // Perform the ES search
    self.client.search({
      index: 'messages', //Or use id for alias
      routing: accountId,
      type: 'message',
      body: {
        query: {
          bool: {
            must: {
              multi_match: {
                query: query,
                fields: fields,
                operator: "and",
                analyzer: "standard",
                type: "cross_fields"
              }
            },
            filter: {
              bool: filter_query
            }
          }
        },
        size: size,
        from: from,
        sort: [{[sort]: sortOrder}],
        highlight: {
          fields: {
            "subject.ngrams": {},
            "bodyText.ngrams": {"number_of_fragments" : 1}
          },
          "pre_tags" : ["<mark>"],
          "post_tags" : ["</mark>"],
        },
        "_source": [
          "accountId",
          "messageId",
          "threadId",
          "subject",
          "from",
          "to",
          "cc",
          "date",
          "labels",
          "files",
          "snippet"
        ]
      }
    }).then(function (resp) {
      const hits = resp.hits.hits;

      let messages = [];
      for(hit of hits) {
        let message = hit['_source'];
        message['subjectHighlight'] =  (hit['highlight'] && hit['highlight']['subject.ngrams']) ? hit['highlight']['subject.ngrams'][0] : null;
        message['bodyTextHighlight'] =  (hit['highlight'] && hit['highlight']['bodyText.ngrams']) ? hit['highlight']['bodyText.ngrams'][0] : null;

        // make sure that highlight is within first 25 chars, to be sure it visible on preview
        if(message['bodyTextHighlight'] && message['bodyTextHighlight'].length > 100) {
          const startPosition = message['bodyTextHighlight'].indexOf('<mark>');
          if (startPosition > 25) {
            let prefixString = message['bodyTextHighlight'].slice(startPosition - 25, startPosition);
            const firstSpace = prefixString.indexOf(' ');
            prefixString = (firstSpace !== -1) ? prefixString.slice(firstSpace) : '';
            message['bodyTextHighlight'] = prefixString.trim() + message['bodyTextHighlight'].slice(startPosition);
          }
        }
        messages.push(message);
      }
      resolve({messages: messages, count:resp.hits.total});
    })
    .catch(err => {
      console.error(err);
      reject(err);
    });
  });
};


/**
 * Search for contacts
 */
ElasticSearch.prototype.contacts = function({accountId: accountId = null, query=null, sort='name', sortOrder='asc', size=20, from=0, fields=[]} = {}) {
  var self = this;
  return new Promise(function(resolve, reject) {
        //Account id that should be searched (parameter: accountId)
        if ( typeof accountId === 'undefined' || !accountId ) {
          reject(Error('Please provide an accountId'));
          return;
        }

        //Search query (parameter: query)
        if ( typeof query === 'undefined' ) {
          reject(Error('Please provide a query'));
          return;
        }

        //Number of results (parameter: size)
        size = parseInt(size);
        if ( size < 1 || size > 100 ) {
          reject(Error('Size parameter must be between 1 and 100'));
          return;
        }

         // Pagination support (parameter: from)
         from = parseInt(from);
         if ( from < 0 ) {
          reject(Error('Invalid from value'));
          return;
        }

        //Which elasticsearch fields should be searched (parameter: fields)
        var default_fields = ['name', 'email'];
        if(fields.length == 0) {
          fields = default_fields;
        }

        // Add .ngrams to the fields
        fields = fields.map(function(x) { return x+'.ngrams'}, fields);

        // Check that only allowed fields are searched
        var allowed_fields = {'name.ngrams':true, 'email.ngrams':true};
        if(!Array.isArray(fields) || !fields.every(elem => elem in allowed_fields)) {
          reject(Error('Fields list contained illegal value'));
          return;
        }
        // Sorting (parameter: sort)
        if(['name', 'email'].indexOf(sort) > -1) {
          sort += ".keyword";
        }

        var allowed_sort = {'name.keyword': true, 'email.keyword': true, 'email_count': true}
        if(!(sort in allowed_sort)) {
          reject(Error('Invalid sort value'));
          return;
        }


         // Sorting order (parameter: sortOrder)
         var allowed_sortOrder = {'desc': true, 'asc': true}
         if(!(sortOrder in allowed_sortOrder)) {
          reject(Error('Invalid sortOrder value'));
          return;
        }


        // All parameters where checked, now construct the ES query
        var bool_query = { filter: {
          term: {accountId: accountId}
        }};

        if(query.length > 0) {
          bool_query['must'] =  {
            multi_match: {
              query: query,
              fields: fields,
              operator: "and",
              analyzer: "standard",
              type: "cross_fields"
            }
          };
        }


        // Perform the ES search
        var search_query = {
              index: 'contacts', //Or use id for alias
              routing: accountId,
              type: 'contact',
              body: {
                query: {
                  bool: bool_query
                },
                size: size,
                from: from,
                sort: [{[sort]: sortOrder}],
                highlight: {fields: {"name.ngrams": {}, "email.ngrams": {}}},
              }};

              self.client.search(search_query).then(function (resp) {

                var hits = resp.hits.hits;
                var output = [];
                for(hit of hits) {
                  var name_highlight = hit['_source']['name'];
                  if('highlight' in hit && 'name.ngrams' in hit['highlight']) {
                    name_highlight = hit['highlight']['name.ngrams'][0];
                  }

                  var email_highlight = hit['_source']['email'];
                  if('highlight' in hit && 'email.ngrams' in hit['highlight']) {
                    email_highlight = hit['highlight']['email.ngrams'][0];
                  }

                  output.push({'contact_id': hit['_id'], "accountId": hit['_source']['accountId'], 'name': hit['_source']['name'], 'email': hit['_source']['email'],
                    'name_highlight': name_highlight, 'email_highlight': email_highlight})
                }

                if(self.check_response(accountId, output)) {
                  resolve(output);
                } else {
                  reject(Error("Unallowed return data"));
                }
              }, function (err) {
                reject(err);
              });
            });
};






/**
 * Search for topics
 */
ElasticSearch.prototype.topics = function({accountId=null, query=null, sort='name', sortOrder='asc', size=20, from=0, fields=[]} = {}) {
  var self = this;
  return new Promise(function(resolve, reject) {
        //Account id that should be searched (parameter: accountId)
        if ( typeof accountId === 'undefined' || !accountId ) {
          reject(Error('Please provide an accountId'));
          return;
        }

        //Search query (parameter: query)
        if ( typeof query === 'undefined' ) {
          reject(Error('Please provide a query'));
          return;
        }

        //Number of results (parameter: size)
        size = parseInt(size);
        if ( size < 1 || size > 100 ) {
          reject(Error('Size parameter must be between 1 and 100'));
          return;
        }

         // Pagination support (parameter: from)
         from = parseInt(from);
         if ( from < 0 ) {
          reject(Error('Invalid from value'));
          return;
        }

        //Which elasticsearch fields should be searched (parameter: fields)
        var default_fields = ['name'];
        if(fields.length == 0) {
          fields = default_fields;
        }

        // Add .ngrams to the fields
        fields = fields.map(function(x) { return x+'.ngrams'}, fields);

        // Check that only allowed fields are searched
        var allowed_fields = {'name.ngrams':true};
        if(!Array.isArray(fields) || !fields.every(elem => elem in allowed_fields)) {
          reject(Error('Fields list contained illegal value'));
          return;
        }
        // Sorting (parameter: sort)
        if(['name'].indexOf(sort) > -1) {
          sort += ".keyword";
        }

        var allowed_sort = {'name.keyword': true}
        if(!(sort in allowed_sort)) {
          reject(Error('Invalid sort value'));
          return;
        }


         // Sorting order (parameter: sortOrder)
         var allowed_sortOrder = {'desc': true, 'asc': true}
         if(!(sortOrder in allowed_sortOrder)) {
          reject(Error('Invalid sortOrder value'));
          return;
        }


        // All parameters where checked, now construct the ES query
        var bool_query = { filter: {
          term: {accountId: accountId}
        }};

        if(query.length > 0) {
          bool_query['must'] =  {
            multi_match: {
              query: query,
              fields: fields,
              operator: "and",
              analyzer: "standard",
              type: "cross_fields"
            }
          };
        }


        // Perform the ES search
        var search_query = {
              index: 'topics', //Or use id for alias
              type: 'topic',
              routing: accountId,
              body: {
                query: {
                  bool: bool_query
                },
                size: size,
                from: from,
                sort: [{[sort]: sortOrder}],
                highlight: {fields: {"name.ngrams": {}}},
              }};

              self.client.search(search_query).then(function (resp) {
            //resolve(resp); return;
            var hits = resp.hits.hits;
            var output = [];
            for(hit of hits) {
              var data = hit['_source'];

              var name_highlight = hit['_source']['name'];
              if('highlight' in hit && 'name.ngrams' in hit['highlight']) {
                name_highlight = hit['highlight']['name.ngrams'][0];
              }

              data['name_highlight'] = name_highlight;
              output.push(data);
            }

            if(self.check_response(accountId, output)) {
              resolve(output);
            } else {
              reject(Error("Unallowed return data"));
            }
          }, function (err) {
            reject(err);
          });
            });
};

/**
 * Logs search queries in ElasticSearch
 */
ElasticSearch.prototype.log_query = function(accountId, query) {
  if(accountId.length > 100 || query.length > 100) {
    return;
  }

  var id = md5(accountId+":"+query);

  this.client.index({
    index: 'history',
    type: 'query',
    routing: accountId,
    id: id,
    body: {
      accountId: accountId,
      query: query,
      date: Math.floor(Date.now() / 1000)
    }
  }, function (error, response) {

  });
}

/**
 * Search for user search history
 */
ElasticSearch.prototype.history = function({accountId=null, query=null, sort='date', sortOrder='desc', size=5, from=0} = {}) {
  var self = this;
  return new Promise(function(resolve, reject) {
        //Account id that should be searched (parameter: accountId)
        if ( typeof accountId === 'undefined' || !accountId ) {
          reject(Error('Please provide an accountId'));
          return;
        }

        //Search query (parameter: query)
        if ( typeof query === 'undefined' ) {
          reject(Error('Please provide a query'));
          return;
        }

        //Number of results (parameter: size)
        size = parseInt(size);
        if ( size < 1 || size > 100 ) {
          reject(Error('Size parameter must be between 1 and 100'));
          return;
        }

         // Pagination support (parameter: from)
         from = parseInt(from);
         if ( from < 0 ) {
          reject(Error('Invalid from value'));
          return;
        }


        fields = "query.ngrams";


        // Sorting (parameter: sort)
        if(['query'].indexOf(sort) > -1) {
          sort += ".keyword";
        }

        var allowed_sort = {'query.keyword': true, 'date': true}
        if(!(sort in allowed_sort)) {
          reject(Error('Invalid sort value'));
          return;
        }

        // Sorting order (parameter: sortOrder)
        var allowed_sortOrder = {'desc': true, 'asc': true}
        if(!(sortOrder in allowed_sortOrder)) {
          reject(Error('Invalid sortOrder value'));
          return;
        }


        // All parameters where checked, now construct the ES query
        var bool_query = { filter: {
          term: {accountId: accountId}
        }};

        bool_query['must'] = []

        if(query.length > 0) {
          bool_query['must'].push({
            multi_match: {
              query: query,
              fields: fields,
              operator: "and",
              analyzer: "standard",
              type: "cross_fields"
            }
          });
        }




        // Perform the ES search
        var search_query = {
              index: 'history', //Or use id for alias
              routing: accountId,
              type: 'query',
              body: {
                query: {
                  bool: bool_query
                },
                size: size,
                from: from,
                sort: [{[sort]: sortOrder}],
                highlight: {fields: {"query.ngrams": {}}},
              }};

              self.client.search(search_query).then(function (resp) {
                var hits = resp.hits.hits;
                var output = [];
                for(hit of hits) {
                  var data = hit['_source'];

                  var query_highlight = hit['_source']['query'];
                  if('highlight' in hit && 'query.ngrams' in hit['highlight']) {
                    query_highlight = hit['highlight']['query.ngrams'][0];
                  }
                  data['query_highlight'] = query_highlight;

                  output.push(data);
                }

                if(self.check_response(accountId, output)) {
                  resolve(output);
                } else {
                  reject(Error("Unallowed return data"));
                }
              }, function (err) {
                reject(err);
              });
            });
};

// export the class
module.exports = new ElasticSearch();
