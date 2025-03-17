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
const receiver = new RabbitRPC();

receiver.handleMessage<string, string>("t1q1", "echo", async (data) => data);

await receiver.init({
  connectionString,
  queues: {
    t1q1: { type: "receiver" },
  },
});

const sender = new RabbitRPC();

const echo = sender.makeCall<string, string>("t1q1", "echo");

await sender.init({
  connectionString,
  queues: {
    t1q1: { type: "sender" },
  },
});

const data = await echo("Hello world");

console.log(data);

await receiver.close();
await sender.close();
```

## Testing

```bash
npm run test
```
