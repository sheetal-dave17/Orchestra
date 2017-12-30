const nodeVault = require('node-vault');
const config = require('../configs');

const vault = nodeVault({
  apiVersion: 'v1',
  endpoint: config.vault.host,
});

const decryptMessage = (message) => {
  if (!message || !message.encrypted) {
    return Promise.resolve(message);
  }

  if (!config.vault.enabled) {
    console.error('Encrypted message and vault is disabled');
    return Promise.resolve(message);
  }

  return vault.write('transit/decrypt/account-' + (message.accountId || message.account_id), {
      batch_input: [
        {ciphertext: message.body},
        {ciphertext: message.bodyText},
        {ciphertext: message.snippet},
        {ciphertext: message.subject}
      ]
    })
    .then(result => {
      message.body = new Buffer(result.data.batch_results[0].plaintext || '', 'base64').toString('utf8');
      message.bodyText = new Buffer(result.data.batch_results[1].plaintext || '', 'base64').toString('utf8');
      message.snippet = new Buffer(result.data.batch_results[2].plaintext || '', 'base64').toString('utf8');
      message.subject = new Buffer(result.data.batch_results[3].plaintext || '', 'base64').toString('utf8');
      message.encrypted = false;
      return Promise.resolve(message);
    })
    .catch(err => {
      console.error(err);
      return Promise.resolve(message);
    });
};

const vaultService = {
  vault: vault,
  prepare: () => {
    if (!config.vault.enabled) {
      console.log("Vault: switched off");
      return Promise.resolve(true);
    }

    console.log("Vault: perform login");
    return vault.approleLogin({ role_id: config.vault.roleId, secret_id: config.vault.secretId })
      .then(result => {
        console.log("\tSuccess");
        vault.token = result.auth.client_token;
        return Promise.resolve(true);
      })
      .catch(err => {
        console.error("\tError:", err);
        return Promise.reject(false);
      })
  },
  decryptMessage: (message) => {
    return decryptMessage(message)
  },
  decryptMessages: (messages) => {
    if (!Array.isArray(messages)) {
      return decryptMessage(messages);
    }

    let promises = [];
    messages.forEach(message => promises.push(decryptMessage(message)));
    return Promise.all(promises);
  },
  encryptMessage: (message) => {
    if(config.vault.enabled) {
      return vault.write('transit/encrypt/account-' + (message.accountId || message.account_id), {
        batch_input: [
          {plaintext: new Buffer.from(message.body).toString('base64')},
          {plaintext: new Buffer.from(message.bodyText).toString('base64')},
          {plaintext: new Buffer.from(message.snippet).toString('base64')},
          {plaintext: new Buffer.from(message.subject).toString('base64')}
        ]
      })
      .then(result => {
        message.body = result.data.batch_results[0].ciphertext;
        message.bodyText = result.data.batch_results[1].ciphertext;
        message.snippet = result.data.batch_results[2].ciphertext;
        message.subject = result.data.batch_results[3].ciphertext;
        message.encrypted = true;
        return Promise.resolve(message);
      });
    }

    return Promise.resolve(message);
  }
};

module.exports = vaultService;
