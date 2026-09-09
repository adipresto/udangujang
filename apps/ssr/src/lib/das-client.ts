import { credentials } from "@grpc/grpc-js";
import {
  HealthServiceClient,
  type HealthCheckResponse,
} from "@udangujang/proto";
// @udangujang/proto's package.json main/types only export health.ts (see
// packages/proto/package.json) — every other generated client is reached
// via a deep import into src/gen, same module the package's own index would
// re-export from if one existed.
import {
  HargaServiceClient,
  type GetHargaResponse,
  type ValidatePromoResponse,
} from "@udangujang/proto/src/gen/udangujang/harga/v1/harga";
import {
  PesananServiceClient,
  type CreatePesananRequest,
  type CreatePesananResponse,
} from "@udangujang/proto/src/gen/udangujang/pesanan/v1/pesanan";

const DAS_ADDR = process.env.DAS_GRPC_ADDR ?? "localhost:50051";

function getClient(): HealthServiceClient {
  return new HealthServiceClient(DAS_ADDR, credentials.createInsecure());
}

export function checkDasHealth(): Promise<HealthCheckResponse> {
  return new Promise((resolve, reject) => {
    const client = getClient();
    client.check({}, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

function getHargaClient(): HargaServiceClient {
  return new HargaServiceClient(DAS_ADDR, credentials.createInsecure());
}

export function getHarga(): Promise<GetHargaResponse> {
  return new Promise((resolve, reject) => {
    const client = getHargaClient();
    client.getHarga({}, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export interface ValidatePromoInput {
  kodePromo: string;
  kgUtuh: number;
  kgKupas: number;
  kgExtra: number;
  subtotal: number;
}

export function validatePromo(input: ValidatePromoInput): Promise<ValidatePromoResponse> {
  return new Promise((resolve, reject) => {
    const client = getHargaClient();
    client.validatePromo(
      {
        kodePromo: input.kodePromo,
        kgUtuh: input.kgUtuh,
        kgKupas: input.kgKupas,
        kgExtra: input.kgExtra,
        subtotal: input.subtotal,
      },
      (err, resp) => {
        client.close();
        if (err) {
          reject(err);
          return;
        }
        resolve(resp);
      },
    );
  });
}

function getPesananClient(): PesananServiceClient {
  return new PesananServiceClient(DAS_ADDR, credentials.createInsecure());
}

export function createPesanan(req: CreatePesananRequest): Promise<CreatePesananResponse> {
  return new Promise((resolve, reject) => {
    const client = getPesananClient();
    client.createPesanan(req, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export type { CreatePesananRequest };
