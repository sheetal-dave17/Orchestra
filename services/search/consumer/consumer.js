const amqp = require('amqplib');

const consumer = {
  consume: (consumerName, queueConfig, messageProcessor, concurrency) => {
    amqp.connect("amqp://" + queueConfig.host + ":" + queueConfig.port)
      .then(conn => {
        process.once('SIGINT', function () {
          conn.close();
        });
        return conn.createChannel()
      })
      .then(ch => {
        const recievedMsg = msg => {
          if (msg.content.toString() === '') {
            return ch.ack(msg);
          }
          messageProcessor(JSON.parse(msg.content.toString()))
            .then(() => ch.ack(msg))
            .catch((err) => {
              console.warn('   = error processing message', msg.fields.deliveryTag, ': ', err);
              ch.ack(msg);
            })
        }

        return ch.assertExchange(queueConfig.exchange.name, queueConfig.exchange.type, {durable: true})
          .then(() => ch.prefetch(concurrency))
          .then(() => ch.assertQueue(consumerName, {durable: true}))
          .then(qok => {
            queueBindings = [];
            queueConfig.routes.forEach(route => queueBindings.push(ch.bindQueue(qok.queue, queueConfig.exchange.name, route)))
            return Promise.all(queueBindings).then(() => qok.queue);
          })
          .then(queue => ch.consume(queue, recievedMsg, {noAck: false, prefetchCount: concurrency}))
      })
      .then(() => {
        console.log(' [*] ' + consumerName + ' consumer waiting for messages');
      })
      .catch(console.warn);
    }
  }

  module.exports = consumer;
