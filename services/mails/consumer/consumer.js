const amqp = require('amqplib');


const consumer = {
  consume: (consumerName, queueConfig, messageProcessor, concurrency) => {
    amqp.connect("amqp://" + queueConfig.host + ":" + queueConfig.port).then(function (conn) {
      process.once('SIGINT', function () {
        conn.close();
      });
      return conn.createChannel().then((ch) => {
        ch.assertExchange(queueConfig.default_exchange, 'fanout', {durable: true})
          .then(() => {
            return ch.prefetch(concurrency);
          })
          .then(() => {
            return ch.assertQueue(consumerName, {durable: true});
          })
          .then(qok => {
            return ch.bindQueue(qok.queue, queueConfig.default_exchange, '')
              .then(() => {
                return qok.queue;
              });
          })
          .then(queue => {
            return ch.consume(queue, recievedMsg, {noAck: false, prefetchCount: concurrency});
          })
          .then(() => {
            console.log(' [*] Waiting for message. To exit press CTRL+C');
          });

        function recievedMsg(msg) {
          if (msg.content.toString() === '') {
            ch.ack(msg);
          }
          else {
            messageProcessor(JSON.parse(msg.content.toString()))
              .then(() => {
                ch.ack(msg);
              })
              .catch((err) => {ch.ack(msg); console.log("   = error processing message ", msg.fields.deliveryTag, ": ", err);})
          }

        }
      });
    }).catch(console.warn);
  }
}

module.exports = consumer;
