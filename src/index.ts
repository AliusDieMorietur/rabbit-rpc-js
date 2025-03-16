import amqp from "amqplib";
import crypto from "node:crypto";

type Message = {
  type: string;
  data: unknown;
};

const buildSenderKey = (queue: string) => `${queue}_${crypto.randomUUID()}`;

export class RabbitRPC {
  #correlationIdMap: Map<string, (value: Message) => void> = new Map();
  #handlersMap: Map<string, (data: Message["data"]) => Promise<unknown>> =
    new Map();
  #connection: amqp.ChannelModel;
  #senderKeysMap: Map<string, string> = new Map();
  #channel: amqp.Channel;
  #callTimeout: number;

  constructor({
    channel,
    connection,
    messageTimeout,
  }: {
    channel: amqp.Channel;
    connection: amqp.ChannelModel;
    messageTimeout?: number;
  }) {
    this.#channel = channel;
    this.#connection = connection;
    this.#callTimeout = messageTimeout ?? 10_000;
  }

  call(queue: string, message: Message) {
    if (!this.#senderKeysMap.has(queue)) {
      throw new Error(`Sender key is not defined for queue: '${queue}'`);
    }
    const senderKey = this.#senderKeysMap.get(queue)!;
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.#correlationIdMap.set(id, resolve);
      this.#channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
        correlationId: id,
        replyTo: senderKey,
      });
      setTimeout(() => {
        this.#correlationIdMap.delete(id);
        reject(new Error(`Call timeout for queue: '${queue}'`));
      }, this.#callTimeout);
    });
  }

  handleMessage<T, U>(type: string, fn: (args: T) => Promise<U>): void {
    this.#handlersMap.set(type, async (data) => await fn(data as T));
  }

  makeCall<T, U>(queue: string, type: Message["type"]) {
    return async (args: T): Promise<U> => {
      const data = await this.call(queue, { type, data: args });
      return data as U;
    };
  }

  async close() {
    await this.#channel.close();
    await this.#connection.close();
  }

  async #onMessage(message: amqp.ConsumeMessage | null) {
    if (!message) {
      console.warn("Message is empty");
      return;
    }
    const id = message.properties.correlationId;
    if (this.#correlationIdMap.has(id)) {
      const data = JSON.parse(message.content.toString());
      const resolve = this.#correlationIdMap.get(id);
      resolve!(data);
      this.#correlationIdMap.delete(id);
    } else {
      const data = JSON.parse(message.content.toString()) as Message;
      const handler = this.#handlersMap.get(data.type);
      if (handler) {
        const result = await handler(data.data);
        const dataToSend = result ?? {
          success: true,
        };
        this.#channel.sendToQueue(
          message.properties.replyTo,
          Buffer.from(JSON.stringify(dataToSend)),
          {
            correlationId: id,
          }
        );
      }
    }
    this.#channel.ack(message);
  }

  async addReceiver(queue: string) {
    await this.#channel.assertQueue(queue, { durable: true });
    await this.#channel.consume(queue, this.#onMessage.bind(this));
  }

  async addSender(queue: string) {
    const senderKey = buildSenderKey(queue);
    this.#senderKeysMap.set(queue, senderKey);
    await this.#channel.assertQueue(queue, { durable: true });
    await this.#channel.assertQueue(senderKey, { durable: true });
    await this.#channel.consume(senderKey, this.#onMessage.bind(this));
  }

  static async init({
    connectionString,
    queues,
  }: {
    connectionString: string;
    queues: Record<string, "receiver" | "sender">;
  }) {
    const connection = await amqp.connect(connectionString);
    const channel = await connection.createChannel();

    const rabbitRPC = new RabbitRPC({
      channel,
      connection,
    });

    await Promise.all(
      Object.entries(queues).map(async ([queue, type]) =>
        type === "receiver"
          ? rabbitRPC.addReceiver(queue)
          : rabbitRPC.addSender(queue)
      )
    );

    return rabbitRPC;
  }
}
