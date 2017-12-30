const amqp = require('amqplib');

const producer = (queueConfig) => {
  let producerChannel = null;

  amqp.connect("amqp://" + queueConfig.host + ":" + queueConfig.port)
    .then(conn => {
      process.once('SIGINT', function () {
        conn.close();
      });
      return conn.createChannel()
    })
    .then(channel => channel.assertExchange(
      queueConfig.exchange.name,
      queueConfig.exchange.type,
      {durable: true}).then(() => channel))
    .then(channel => producerChannel = channel)
    .catch(console.warn);

  return {
    publish: (message, routingKey) => {
      if (!producerChannel) {
        console.warn('No channel defined');
        return false;
      }
      producerChannel.publish(queueConfig.exchange.name, routingKey, Buffer.from(JSON.stringify(message)))
    }
  }
}

module.exports = producer;
