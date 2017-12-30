const vault = require('./services/vault');

vault.prepare()
  .then(result => {
    console.log(result);
  })
  .catch(error => {
    console.log(error);
  });

