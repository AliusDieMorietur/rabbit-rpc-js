import { expect, test, vi } from "vitest";
import { RabbitRPC } from "../src";

const connectionString = "amqp://admin:admin@localhost:5672";

test("Echo example. Single receiver. Single sender", async () => {
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

  expect(data).toBe("Hello world");

  await receiver.close();
  await sender.close();
});

test("Echo example. Multiple receivers. Single sender", async () => {
  const receiver1 = new RabbitRPC();

  receiver1.handleMessage<void, string>("t2q1", "echo1", async () => "echo1");
  receiver1.handleMessage<void, string>("t2q1", "echo2", async () => "echo2");

  await receiver1.init({
    connectionString,
    queues: {
      t2q1: { type: "receiver" },
    },
  });

  const receiver2 = new RabbitRPC();

  receiver2.handleMessage<void, string>("t2q1", "echo1", async () => "echo2");
  receiver2.handleMessage<void, string>("t2q1", "echo2", async () => "echo2");

  await receiver2.init({
    connectionString,
    queues: {
      t2q1: { type: "receiver" },
    },
  });

  const sender = new RabbitRPC();

  const echo1 = sender.makeCall<void, string>("t2q1", "echo1");
  const echo2 = sender.makeCall<void, string>("t2q1", "echo2");

  await sender.init({
    connectionString,
    queues: {
      t2q1: { type: "sender" },
    },
  });

  const [data1, data2] = await Promise.all([echo1(), echo2()]);

  expect(data1).toBe("echo1");
  expect(data2).toBe("echo2");

  await receiver1.close();
  await receiver2.close();
  await sender.close();
});

test("Echo example. Multiple receivers. Multiple senders", async () => {
  const receiver1 = new RabbitRPC();

  receiver1.handleMessage<void, string>("t3q1", "echo1", async () => "echo1");
  receiver1.handleMessage<void, string>("t3q1", "echo2", async () => "echo2");

  await receiver1.init({
    connectionString,
    queues: {
      t3q1: { type: "receiver" },
    },
  });

  const receiver2 = new RabbitRPC();

  receiver2.handleMessage<void, string>("t3q1", "echo1", async () => "echo1");
  receiver2.handleMessage<void, string>("t3q1", "echo2", async () => "echo2");

  await receiver2.init({
    connectionString,
    queues: {
      t3q1: { type: "receiver" },
    },
  });

  const sender1 = new RabbitRPC();

  const echo1 = sender1.makeCall<void, string>("t3q1", "echo1");

  await sender1.init({
    connectionString,
    queues: {
      t3q1: { type: "sender" },
    },
  });

  const sender2 = new RabbitRPC();

  const echo2 = sender2.makeCall<void, string>("t3q1", "echo2");

  await sender2.init({
    connectionString,
    queues: {
      t3q1: { type: "sender" },
    },
  });

  const [data1, data2] = await Promise.all([echo1(), echo2()]);

  expect(data1).toBe("echo1");
  expect(data2).toBe("echo2");

  await receiver1.close();
  await receiver2.close();
  await sender1.close();
  await sender2.close();
});

test("Echo example. Two way messaging", async () => {
  const a = new RabbitRPC();

  a.handleMessage<void, string>("t4a", "a", async () => "a");
  const callToB = a.makeCall<void, string>("t4b", "b");

  await a.init({
    connectionString,
    queues: {
      t4a: { type: "receiver" },
      t4b: { type: "sender" },
    },
  });

  const b = new RabbitRPC();

  b.handleMessage<void, string>("t4b", "b", async () => "b");
  const callToA = b.makeCall<void, string>("t4a", "a");

  await b.init({
    connectionString,
    queues: {
      t4a: { type: "sender" },
      t4b: { type: "receiver" },
    },
  });

  const [dataA, dataB] = await Promise.all([callToA(), callToB()]);

  expect(dataA).toBe("a");
  expect(dataB).toBe("b");

  await a.close();
  await b.close();
});

test("Close", async () => {
  vi.useFakeTimers();
  const sender = new RabbitRPC();

  const echo = sender.makeCall<string, string>("t5q1", "echo");

  await sender.init({
    connectionString,
    queues: {
      t5q1: { type: "sender", callTimeout: 1000 },
    },
  });

  const echoPromise = echo("Hello world").catch((error) => error);

  await sender.close();
  vi.advanceTimersByTime(1500);
  const error = await echoPromise;

  expect(error).toBeInstanceOf(Error);

  vi.useRealTimers();
});

test("Timeout", async () => {
  vi.useFakeTimers();
  const sender = new RabbitRPC();

  const echo = sender.makeCall<string, string>("t6q1", "echo");

  await sender.init({
    connectionString,
    queues: {
      t6q1: { type: "sender", callTimeout: 1000 },
    },
  });

  const echoPromise = echo("Hello world").catch((error) => error);
  vi.advanceTimersByTime(1500);
  const error = await echoPromise;
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe(
    `Call timeout for queue = 't6q1' and event = 'echo'`
  );
  vi.useRealTimers();
});

test("Echo example. Error handling", async () => {
  const receiver = new RabbitRPC();

  receiver.handleMessage<string, string>("t7q1", "echo", async (data) => {
    throw new Error("Special echo error 1");
  });

  await receiver.init({
    connectionString,
    queues: {
      t7q1: { type: "receiver" },
    },
  });

  const sender = new RabbitRPC();

  const echo = sender.makeCall<string, string>("t7q1", "echo");

  await sender.init({
    connectionString,
    queues: {
      t7q1: { type: "sender" },
    },
  });

  const data = await echo("Hello world").catch((error) => error);

  expect(data.message).toBe("Special echo error 1");

  await receiver.close();
  await sender.close();
});
