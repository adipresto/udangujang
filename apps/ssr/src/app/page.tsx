import { checkDasHealth } from "@/lib/das-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let dasStatus: string;
  try {
    const resp = await checkDasHealth();
    dasStatus = `${resp.status} (${resp.message})`;
  } catch (err) {
    dasStatus = `UNREACHABLE (${err instanceof Error ? err.message : String(err)})`;
  }

  return (
    <main>
      <h1>udangujang</h1>
      <p>SSR scaffold — UDMC-1. Fitur bisnis menyusul di tiket berikutnya.</p>
      <p>
        DAS health: <strong>{dasStatus}</strong>
      </p>
    </main>
  );
}
