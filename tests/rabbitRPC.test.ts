import { expect, test } from "vitest";
import { RabbitRPC } from "../src";

const connectionString = "amqp://admin:admin@localhost:5672";

test("Echo. Single receiver. Single sender", async () => {
  const receiver = await RabbitRPC.init({
    connectionString,
    queues: {
      t1q1: "receiver",
    },
  });

  receiver.handleMessage<string, string>("echo", async (data) => data);

  const sender = await RabbitRPC.init({
    connectionString,
    queues: {
      t1q1: "sender",
    },
  });

  const echo = sender.makeCall<string, string>("t1q1", "echo");

  const data = await echo("Hello world");

  expect(data).toBe("Hello world");
});

test("Echo example. Multiple receivers. Single sender", async () => {
  const receiver1 = await RabbitRPC.init({
    connectionString,
    queues: {
      t2q1: "receiver",
    },
  });

  receiver1.handleMessage<void, string>("echo1", async () => "echo1");
  receiver1.handleMessage<void, string>("echo2", async () => "echo2");

  const receiver2 = await RabbitRPC.init({
    connectionString,
    queues: {
      t2q1: "receiver",
    },
  });

  receiver2.handleMessage<void, string>("echo1", async () => "echo2");
  receiver2.handleMessage<void, string>("echo2", async () => "echo2");

  const sender = await RabbitRPC.init({
    connectionString,
    queues: {
      t2q1: "sender",
    },
  });

  const echo1 = sender.makeCall<void, string>("t2q1", "echo1");
  const echo2 = sender.makeCall<void, string>("t2q1", "echo2");

  const [data1, data2] = await Promise.all([echo1(), echo2()]);

  expect(data1).toBe("echo1");
  expect(data2).toBe("echo2");
});

test("Echo example. Multiple receivers. Multiple senders", async () => {
  const receiver1 = await RabbitRPC.init({
    connectionString,
    queues: {
      t3q1: "receiver",
    },
  });

  receiver1.handleMessage<void, string>("echo1", async () => "echo1");
  receiver1.handleMessage<void, string>("echo2", async () => "echo2");

  const receiver2 = await RabbitRPC.init({
    connectionString,
    queues: {
      t3q1: "receiver",
    },
  });

  receiver2.handleMessage<void, string>("echo1", async () => "echo2");
  receiver2.handleMessage<void, string>("echo2", async () => "echo2");

  const sender1 = await RabbitRPC.init({
    connectionString,
    queues: {
      t3q1: "sender",
    },
  });

  const echo1 = sender1.makeCall<void, string>("t3q1", "echo1");

  const sender2 = await RabbitRPC.init({
    connectionString,
    queues: {
      t3q1: "sender",
    },
  });

  const echo2 = sender2.makeCall<void, string>("t3q1", "echo2");

  const [data1, data2] = await Promise.all([echo1(), echo2()]);

  expect(data1).toBe("echo1");
  expect(data2).toBe("echo2");
});

test("Echo example. Two way messaging", async () => {
  const a = await RabbitRPC.init({
    connectionString,
    queues: {
      t4a: "receiver",
      t4b: "sender",
    },
  });

  a.handleMessage<void, string>("a", async () => "a");
  const callToB = a.makeCall<void, string>("t4b", "b");

  const b = await RabbitRPC.init({
    connectionString,
    queues: {
      t4a: "sender",
      t4b: "receiver",
    },
  });

  b.handleMessage<void, string>("b", async () => "b");
  const callToA = b.makeCall<void, string>("t4a", "a");

  const [dataA, dataB] = await Promise.all([callToA(), callToB()]);

  expect(dataA).toBe("a");
  expect(dataB).toBe("b");
});
