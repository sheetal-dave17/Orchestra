const nodeCache = new require('node-cache');

const AutoReply = require('../models/mongoose/auto-reply');


const cache = new nodeCache({
  checkperiod: 60 * 10,
  errorOnMissing: false,
  stdTTL: 60 * 60,
  useClones: true,
});

const setToCache = (key, value) => {
  return new Promise ((resolve, reject) => {
    cache.set(key, value, (error, success) => {
      if (error) {
        return reject(error);
      }

      return resolve(true);
    });
  });
};

const getFromCache = (key) => {
  return new Promise((resolve, reject) => {
    cache.get(key, (error, value) => {
      if (error) {
        return reject(error);
      }

      return resolve(value);
    });
  });
};

const getFromDatabase = (key) => {
  return new Promise((resolve, reject) => {
    AutoReply.findOne({
      accountId: key
    })
      .then((data) => {
        if (!data) {
          setToCache(key, null);
          return resolve(null);
        }

        const result = {
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
          content: data.content,
          enabled: !!data.enabled,
        };

        setToCache(key, result);
        return resolve(result);
      })
      .catch(error => {
        return reject(error);
      })
  });
};


const getByAccountId = (id) => {
  return new Promise((resolve, reject) => {
    getFromCache(id)
      .then(value => {
        if (value !== undefined) {
          return resolve(value);
        }

        return getFromDatabase(id)
          .then(resolve)
          .catch(reject);
      })
      .catch(error => {
        console.error(error);
        return getFromDatabase(id)
          .then(resolve)
          .catch(reject);
      });
  });
};

const invalidateByAccountId = (id) => {
  cache.del(id);
};


module.exports = {
  getByAccountId,
  invalidateByAccountId,
};
