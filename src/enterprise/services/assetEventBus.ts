import { EventEmitter } from "events";

/** Internal domain events for downstream Balance Sheet / Tax / Profitability. */
export type AssetDomainEvent =
  | {
      type: "asset.approved";
      userId: string;
      assetId: string;
      clientId: string;
    }
  | {
      type: "asset.updated";
      userId: string;
      assetId: string;
      clientId: string;
    }
  | {
      type: "asset.returned";
      userId: string;
      assetId: string;
      clientId: string;
    }
  | {
      type: "asset.expense_classified";
      userId: string;
      assetId: string;
      clientId: string;
    };

class AssetEventBus extends EventEmitter {
  publish(event: AssetDomainEvent): void {
    setImmediate(() => {
      this.emit(event.type, event);
      this.emit("asset.*", event);
    });
  }
}

export const assetEventBus = new AssetEventBus();
