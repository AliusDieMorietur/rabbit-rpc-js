import amqp from "amqplib";
import crypto from "node:crypto";

type DataMessage = {
  event: string;
  type: "data";
  data: unknown;
};

type ErrorMessage = {
  event: string;
  type: "error";
  error: string;
};

export type Message = DataMessage | ErrorMessage;

export type QueueSettings = {
  type: "receiver" | "sender";
  callTimeout?: number;
};

export class RabbitRPC {
  #defaultCallTimeout: number = 10_000;
  #correlationIdMap: Map<
    string,
    {
      resolve: (value: DataMessage["data"]) => void;
      reject: (error: Error) => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  > = new Map();
  #handlersMap: Map<string, (data: DataMessage["data"]) => Promise<unknown>> =
    new Map();
  #connection?: amqp.ChannelModel;
  #senderKeysMap: Map<string, string> = new Map();
  #channel?: amqp.Channel;
  #queueSettings: Map<string, QueueSettings> = new Map();

  constructor() {}

  async connect(connectionString: string) {
    this.#connection = await amqp.connect(connectionString);
    this.#channel = await this.#connection.createChannel();
  }

  #checkInitialized() {
    if (!this.#channel) {
      throw new Error("Channel is not initialized");
    }
    if (!this.#connection) {
      throw new Error("Connection is not initialized");
    }
  }

  #buildSenderKey(queue: string) {
    return `${queue}_${crypto.randomUUID()}`;
  }

  call(queue: string, message: Omit<DataMessage, "type">) {
    if (!this.#channel) {
      throw new Error("Channel is not initialized");
    }
    if (!this.#senderKeysMap.has(queue)) {
      throw new Error(`Sender key is not defined for queue: '${queue}'`);
    }
    const senderKey = this.#senderKeysMap.get(queue)!;
    const id = crypto.randomUUID();
    const callTimeout =
      this.#queueSettings.get(queue)?.callTimeout ?? this.#defaultCallTimeout;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#correlationIdMap.delete(id);
        reject(new Error(`Call timeout for queue: '${queue}'`));
      }, callTimeout);
      this.#correlationIdMap.set(id, { resolve, timeout, reject });
      this.#channel?.sendToQueue(
        queue,
        Buffer.from(JSON.stringify({ ...message, type: "data" })),
        {
          correlationId: id,
          replyTo: senderKey,
        }
      );
    });
  }

  handleMessage<T, U>(
    queue: string,
    type: string,
    fn: (args: T) => Promise<U>
  ): void {
    this.#handlersMap.set(
      this.#buildEventTypeKey(queue, type),
      async (data) => await fn(data as T)
    );
  }

  makeCall<T, U>(queue: string, event: Message["event"]) {
    return async (args: T): Promise<U> => {
      const data = await this.call(queue, { event, data: args });
      return data as U;
    };
  }

  async close() {
    if (!this.#channel) {
      throw new Error("Channel is not initialized");
    }
    if (!this.#connection) {
      throw new Error("Connection is not initialized");
    }
    for (const values of this.#correlationIdMap.values()) {
      clearTimeout(values.timeout);
      values.reject(new Error("Connection closed"));
    }
    await this.#channel.close();
    await this.#connection.close();
  }

  #buildEventTypeKey(queue: string, type: string) {
    return `${queue}_${type}`;
  }

  #onMessage(queue: string) {
    return async (message: amqp.ConsumeMessage | null) => {
      this.#checkInitialized();
      if (!message) {
        console.warn("Message is empty");
        return;
      }
      const id = message.properties.correlationId;
      if (this.#correlationIdMap.has(id)) {
        const data = JSON.parse(message.content.toString()) as Message;
        const { resolve, reject, timeout } = this.#correlationIdMap.get(id)!;
        clearTimeout(timeout);
        if (data.type === "error") {
          console.log("data.error", data.error);
          reject(new Error(data.error));
        } else {
          resolve(data.data);
        }
        this.#correlationIdMap.delete(id);
      } else {
        const data = JSON.parse(message.content.toString()) as DataMessage;
        const handler = this.#handlersMap.get(
          this.#buildEventTypeKey(queue, data.event)
        );
        if (handler) {
          const result = await handler(data.data).catch((error) => error);
          const dataToSend =
            result instanceof Error
              ? {
                  event: data.event,
                  type: "error",
                  error: result.message,
                }
              : {
                  event: data.event,
                  type: "data",
                  data: result ?? {
                    success: true,
                  },
                };
          this.#channel!.sendToQueue(
            message.properties.replyTo,
            Buffer.from(JSON.stringify(dataToSend)),
            {
              correlationId: id,
            }
          );
        }
      }
      this.#channel!.ack(message);
    };
  }

  async addReceiver(queue: string, settings: QueueSettings) {
    this.#checkInitialized();
    this.#queueSettings.set(queue, settings);
    await this.#channel!.assertQueue(queue, { durable: true });
    await this.#channel!.consume(queue, this.#onMessage.bind(this)(queue));
  }

  async addSender(queue: string, settings: QueueSettings) {
    this.#queueSettings.set(queue, settings);
    const senderKey = this.#buildSenderKey(queue);
    this.#senderKeysMap.set(queue, senderKey);
    await this.#channel!.assertQueue(queue, { durable: true });
    await this.#channel!.assertQueue(senderKey, { durable: true });
    await this.#channel!.consume(senderKey, this.#onMessage.bind(this)(queue));
  }

  async init({
    connectionString,
    queues,
  }: {
    connectionString: string;
    queues: Record<string, QueueSettings>;
  }) {
    await this.connect(connectionString);

    await Promise.all(
      Object.entries(queues).map(async ([queue, settings]) =>
        settings.type === "receiver"
          ? this.addReceiver(queue, settings)
          : this.addSender(queue, settings)
      )
    );
  }
}
