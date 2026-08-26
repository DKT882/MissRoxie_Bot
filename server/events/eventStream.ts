import { Response } from 'express';

class EventStreamManager {
  private clients: Set<Response> = new Set();

  public addClient(res: Response) {
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  public broadcast(eventType: string, payload: any) {
    const data = JSON.stringify({ eventType, timestamp: new Date().toISOString(), ...payload });
    for (const client of this.clients) {
      try {
        client.write(`data: ${data}\n\n`);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  public getConnectedCount(): number {
    return this.clients.size;
  }
}

export const eventStreamManager = new EventStreamManager();
