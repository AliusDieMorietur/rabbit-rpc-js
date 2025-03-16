import { expect, test, vi } from "vitest";
import { RabbitRPC } from "../src";

const connectionString = "amqp://admin:admin@localhost:5672";

test("Echo example. Single receiver. Single sender", async () => {
  const receiver = await RabbitRPC.init({
    connectionString,
    queues: {
      t1q1: { type: "receiver" },
    },
  });

  receiver.handleMessage<string, string>("t1q1", "echo", async (data) => data);

  const sender = await RabbitRPC.init({
    connectionString,
    queues: {
      t1q1: { type: "sender" },
    },
  });

  const echo = sender.makeCall<string, string>("t1q1", "echo");

  const data = await echo("Hello world");

  expect(data).toBe("Hello world");

  await receiver.close();
  await sender.close();
});

test("Echo example. Multiple receivers. Single sender", async () => {
  const receiver1 = await RabbitRPC.init({
    connectionString,
    queues: {
      t2q1: { type: "receiver" },
    },
  });

  receiver1.handleMessage<void, string>("t2q1", "echo1", async () => "echo1");
  receiver1.handleMessage<void, string>("t2q1", "echo2", async () => "echo2");

  const receiver2 = await RabbitRPC.init({
    connectionString,
    queues: {
      t2q1: { type: "receiver" },
    },
  });

  receiver2.handleMessage<void, string>("t2q1", "echo1", async () => "echo2");
  receiver2.handleMessage<void, string>("t2q1", "echo2", async () => "echo2");

  const sender = await RabbitRPC.init({
    connectionString,
    queues: {
      t2q1: { type: "sender" },
    },
  });

  const echo1 = sender.makeCall<void, string>("t2q1", "echo1");
  const echo2 = sender.makeCall<void, string>("t2q1", "echo2");

  const [data1, data2] = await Promise.all([echo1(), echo2()]);

  expect(data1).toBe("echo1");
  expect(data2).toBe("echo2");

  await receiver1.close();
  await receiver2.close();
  await sender.close();
});

test("Echo example. Multiple receivers. Multiple senders", async () => {
  const receiver1 = await RabbitRPC.init({
    connectionString,
    queues: {
      t3q1: { type: "receiver" },
    },
  });

  receiver1.handleMessage<void, string>("t3q1", "echo1", async () => "echo1");
  receiver1.handleMessage<void, string>("t3q1", "echo2", async () => "echo2");

  const receiver2 = await RabbitRPC.init({
    connectionString,
    queues: {
      t3q1: { type: "receiver" },
    },
  });

  receiver2.handleMessage<void, string>("t3q1", "echo1", async () => "echo1");
  receiver2.handleMessage<void, string>("t3q1", "echo2", async () => "echo2");

  const sender1 = await RabbitRPC.init({
    connectionString,
    queues: {
      t3q1: { type: "sender" },
    },
  });

  const echo1 = sender1.makeCall<void, string>("t3q1", "echo1");

  const sender2 = await RabbitRPC.init({
    connectionString,
    queues: {
      t3q1: { type: "sender" },
    },
  });

  const echo2 = sender2.makeCall<void, string>("t3q1", "echo2");

  const [data1, data2] = await Promise.all([echo1(), echo2()]);

  expect(data1).toBe("echo1");
  expect(data2).toBe("echo2");

  await receiver1.close();
  await receiver2.close();
  await sender1.close();
  await sender2.close();
});

test("Echo example. Two way messaging", async () => {
  const a = await RabbitRPC.init({
    connectionString,
    queues: {
      t4a: { type: "receiver" },
      t4b: { type: "sender" },
    },
  });

  a.handleMessage<void, string>("t4a", "a", async () => "a");
  const callToB = a.makeCall<void, string>("t4b", "b");

  const b = await RabbitRPC.init({
    connectionString,
    queues: {
      t4a: { type: "sender" },
      t4b: { type: "receiver" },
    },
  });

  b.handleMessage<void, string>("t4b", "b", async () => "b");
  const callToA = b.makeCall<void, string>("t4a", "a");

  const [dataA, dataB] = await Promise.all([callToA(), callToB()]);

  expect(dataA).toBe("a");
  expect(dataB).toBe("b");

  await a.close();
  await b.close();
});

test("Close", async () => {
  vi.useFakeTimers();
  const sender = await RabbitRPC.init({
    connectionString,
    queues: {
      t5q1: { type: "sender", callTimeout: 1000 },
    },
  });

  const echo = sender.makeCall<string, string>("t5q1", "echo");

  const echoPromise = echo("Hello world").catch((error) => error);
  await sender.close();
  vi.advanceTimersByTime(1500);
  const error = await echoPromise;

  expect(error).toBeInstanceOf(Error);

  vi.useRealTimers();
});

test("Timeout", async () => {
  vi.useFakeTimers();
  const sender = await RabbitRPC.init({
    connectionString,
    queues: {
      t5q1: { type: "sender", callTimeout: 1000 },
    },
  });

  const echo = sender.makeCall<string, string>("t5q1", "echo");

  const echoPromise = echo("Hello world").catch((error) => error);
  vi.advanceTimersByTime(1500);
  const error = await echoPromise;
  expect(error).toBeInstanceOf(Error);

  vi.useRealTimers();
});
