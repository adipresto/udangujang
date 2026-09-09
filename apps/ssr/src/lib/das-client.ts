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
  type UpdateHargaRequest,
  type UpdateHargaResponse,
  type ListPromosResponse,
  type CreatePromoRequest,
  type CreatePromoResponse,
  type UpdatePromoRequest,
  type UpdatePromoResponse,
  type SetPromoActiveResponse,
} from "@udangujang/proto/src/gen/udangujang/harga/v1/harga";
import {
  PesananServiceClient,
  type CreatePesananRequest,
  type CreatePesananResponse,
  type GetPesananDetailResponse,
  type ListPesananRequest,
  type ListPesananResponse,
  type UpdateStatusPesananRequest,
  type UpdateStatusPesananResponse,
} from "@udangujang/proto/src/gen/udangujang/pesanan/v1/pesanan";
import {
  AlamatServiceClient,
  KastamerServiceClient,
  type Alamat,
  type GetKastamerByNoHpResponse,
  type Kastamer,
  type ListAlamatByKastamerResponse,
  type ListKastamerResponse,
} from "@udangujang/proto/src/gen/udangujang/kastamer/v1/kastamer";
import {
  TransaksiServiceClient,
  type CreateTransaksiResponse,
  type ListTransaksiResponse,
  type ReorderTransaksiResponse,
  type Transaksi,
  type UpdateTransaksiResponse,
} from "@udangujang/proto/src/gen/udangujang/transaksi/v1/transaksi";
import {
  RuteServiceClient,
  type Depot,
  type GetDepotResponse,
  type GetRuteResponse,
  type SaveRuteResponse,
} from "@udangujang/proto/src/gen/udangujang/rute/v1/rute";
import {
  WilayahServiceClient,
  type ListWilayahResponse,
  type Wilayah,
} from "@udangujang/proto/src/gen/udangujang/kastamer/v1/kastamer";

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

export function updateHarga(req: UpdateHargaRequest): Promise<UpdateHargaResponse> {
  return new Promise((resolve, reject) => {
    const client = getHargaClient();
    client.updateHarga(req, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function listPromos(): Promise<ListPromosResponse> {
  return new Promise((resolve, reject) => {
    const client = getHargaClient();
    client.listPromos({}, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function createPromo(req: CreatePromoRequest): Promise<CreatePromoResponse> {
  return new Promise((resolve, reject) => {
    const client = getHargaClient();
    client.createPromo(req, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function updatePromo(req: UpdatePromoRequest): Promise<UpdatePromoResponse> {
  return new Promise((resolve, reject) => {
    const client = getHargaClient();
    client.updatePromo(req, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function deletePromo(code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = getHargaClient();
    client.deletePromo({ code }, (err) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function setPromoActive(code: string, active: boolean): Promise<SetPromoActiveResponse> {
  return new Promise((resolve, reject) => {
    const client = getHargaClient();
    client.setPromoActive({ code, active }, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
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

// ListPesananRequest narrows by delivery date range (tanggal_antar) and/or
// exact status match; unset fields mean "no filter". limit <= 0 = unlimited.
export interface ListPesananInput {
  tanggalDari?: Date;
  tanggalSampai?: Date;
  statusPengiriman?: string;
  statusPembayaran?: string;
  limit?: number;
}

export function listPesanan(input: ListPesananInput = {}): Promise<ListPesananResponse> {
  const req: ListPesananRequest = {
    tanggalDari: input.tanggalDari,
    tanggalSampai: input.tanggalSampai,
    statusPengiriman: input.statusPengiriman ?? "",
    statusPembayaran: input.statusPembayaran ?? "",
    limit: input.limit ?? 0,
  };
  return new Promise((resolve, reject) => {
    const client = getPesananClient();
    client.listPesanan(req, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function getPesananDetail(id: string): Promise<GetPesananDetailResponse> {
  return new Promise((resolve, reject) => {
    const client = getPesananClient();
    client.getPesananDetail({ id }, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function updateStatusPesanan(
  req: UpdateStatusPesananRequest,
): Promise<UpdateStatusPesananResponse> {
  return new Promise((resolve, reject) => {
    const client = getPesananClient();
    client.updateStatusPesanan(req, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

function getKastamerClient(): KastamerServiceClient {
  return new KastamerServiceClient(DAS_ADDR, credentials.createInsecure());
}

function getAlamatClient(): AlamatServiceClient {
  return new AlamatServiceClient(DAS_ADDR, credentials.createInsecure());
}

export type { Kastamer, Alamat };

export function listKastamer(): Promise<ListKastamerResponse> {
  return new Promise((resolve, reject) => {
    const client = getKastamerClient();
    client.listKastamer({}, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function getKastamerByNoHp(noHp: string): Promise<GetKastamerByNoHpResponse> {
  return new Promise((resolve, reject) => {
    const client = getKastamerClient();
    client.getKastamerByNoHp({ noHp }, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function listAlamatByKastamer(kastamerId: string): Promise<ListAlamatByKastamerResponse> {
  return new Promise((resolve, reject) => {
    const client = getAlamatClient();
    client.listAlamatByKastamer({ kastamerId }, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

function getTransaksiClient(): TransaksiServiceClient {
  return new TransaksiServiceClient(DAS_ADDR, credentials.createInsecure());
}

export type { Transaksi };

export interface ListTransaksiInput {
  tanggalDari?: string;
  tanggalSampai?: string;
  kategori?: string;
  limit?: number;
}

export function listTransaksi(input: ListTransaksiInput = {}): Promise<ListTransaksiResponse> {
  return new Promise((resolve, reject) => {
    const client = getTransaksiClient();
    client.listTransaksi(
      {
        tanggalDari: input.tanggalDari ?? "",
        tanggalSampai: input.tanggalSampai ?? "",
        kategori: input.kategori ?? "",
        limit: input.limit ?? 0,
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

export function createTransaksi(transaksi: Transaksi): Promise<CreateTransaksiResponse> {
  return new Promise((resolve, reject) => {
    const client = getTransaksiClient();
    client.createTransaksi({ transaksi }, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function updateTransaksi(id: string, transaksi: Transaksi): Promise<UpdateTransaksiResponse> {
  return new Promise((resolve, reject) => {
    const client = getTransaksiClient();
    client.updateTransaksi({ id, transaksi }, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function deleteTransaksi(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = getTransaksiClient();
    client.deleteTransaksi({ id }, (err) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function reorderTransaksi(tanggal: string, ids: string[]): Promise<ReorderTransaksiResponse> {
  return new Promise((resolve, reject) => {
    const client = getTransaksiClient();
    client.reorderTransaksi({ tanggal, ids }, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

function getRuteClient(): RuteServiceClient {
  return new RuteServiceClient(DAS_ADDR, credentials.createInsecure());
}

export type { Depot };

export function getRute(tanggal: string): Promise<GetRuteResponse> {
  return new Promise((resolve, reject) => {
    const client = getRuteClient();
    client.getRute({ tanggal }, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function saveRute(tanggal: string, pesananIds: string[]): Promise<SaveRuteResponse> {
  return new Promise((resolve, reject) => {
    const client = getRuteClient();
    client.saveRute({ tanggal, pesananIds }, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function deleteRute(tanggal: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = getRuteClient();
    client.deleteRute({ tanggal }, (err) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function getDepot(): Promise<GetDepotResponse> {
  return new Promise((resolve, reject) => {
    const client = getRuteClient();
    client.getDepot({}, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

export function updateDepot(depot: Depot): Promise<Depot> {
  return new Promise((resolve, reject) => {
    const client = getRuteClient();
    client.updateDepot({ depot }, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp.depot ?? depot);
    });
  });
}

function getWilayahClient(): WilayahServiceClient {
  return new WilayahServiceClient(DAS_ADDR, credentials.createInsecure());
}

export type { Wilayah };

export function listWilayah(): Promise<ListWilayahResponse> {
  return new Promise((resolve, reject) => {
    const client = getWilayahClient();
    client.listWilayah({}, (err, resp) => {
      client.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}
