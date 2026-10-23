import { KagamiWorkspace } from "@/components/kagami/workspace";
export default async function KagamiPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; tool?: string }>;
}) {
  const { module, tool } = await searchParams;
  return (
    <KagamiWorkspace
      initialModule={
        module === "approvals"
          ? "approvals"
          : module === "futureview" || tool === "inspect" || tool === "compare"
            ? "futureview"
            : "authority"
      }
      initialPurpose={tool === "compare"}
    />
  );
}
