const nodeCache = new require('node-cache');

const nylasService = require('../services/nylas');


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

const getFromService = (key) => {
  return new Promise((resolve, reject) => {
    nylasService.getAccount(key)
      .then(account => {
        const email = account.email || null;
        setToCache(key, email);
        return resolve(email);
      })
      .catch(error => {
        return reject(error);
      });
  });
};


const getByAccountId = (id) => {
  return new Promise((resolve, reject) => {
    getFromCache(id)
      .then(value => {
        if (value !== undefined) {
          return resolve(value);
        }

        return getFromService(id)
          .then(resolve)
          .catch(reject);
      })
      .catch(error => {
        console.error(error);
        return getFromService(id)
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
