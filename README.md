# rabbit-rpc-js

## Prerequisites

For using and testing this package, you need to have RabbitMQ installed and running.

```bash
docker run -d --name rabbitmq -e RABBITMQ_DEFAULT_USER=admin -e RABBITMQ_DEFAULT_PASS=admin -p 5672:5672 -p 15672:15672 rabbitmq:4.0-management
```

## Installation

### npm

```bash
npm install rabbit-rpc-js
```

### pnpm

```bash
pnpm add rabbit-rpc-js
```

## Usage

```ts
import { RabbitRPC } from "rabbit-rpc-js";

const connectionString = "amqp://admin:admin@localhost:5672";

const receiver = await RabbitRPC.init({
  connectionString,
  queues: {
    t1q1: { type: "receiver" },
  },
});

receiver.handleMessage("echo", async (data) => data);

const sender = await RabbitRPC.init({
  connectionString,
  queues: {
    t1q1: { type: "sender" },
  },
});

const echo = sender.makeCall("t1q1", "echo");

const data = await echo("Hello world");

console.log("data", data);

await receiver.close();
await sender.close();
```

## Testing

```bash
npm run test
```
