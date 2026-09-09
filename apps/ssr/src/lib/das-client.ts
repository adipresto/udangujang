import { credentials } from "@grpc/grpc-js";
import {
  HealthServiceClient,
  type HealthCheckResponse,
} from "@udangujang/proto";

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
