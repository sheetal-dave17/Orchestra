# orchestra
Unified repository for MicroServices of orchestra layer

## For set up and start:
```
docker-compose up -d --no-recreate && \
cd services/mails && npm install && \
cd ../../services/notifications && npm install && \
cd ../../services/accounts && npm install && \
cd ../../services/search && npm install && \
cd ../.. && \
pm2 start ecosystem.json
```

## Stop services:
```pm2 stop all && docker-compose stop```

## List running services:
```pm2 ls```

## Logs of service(s):
```pm2 logs all```

or

```pm2 logs <service-name>```


## Connect to local mongo db
docker run -it --link orchestra-mongo:mongo --rm mongo sh -c 'exec mongo "$MONGO_PORT_27017_TCP_ADDR:$MONGO_PORT_27017_TCP_PORT/deepframe-topics"'

## Elastic search preparation
```node services/search/migration```
