import { ModeWorkspace } from "@/components/workspace/mode-workspace";
export default async function PreviousInspector({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string }>;
}) {
  const { tool } = await searchParams;
  return (
    <ModeWorkspace
      mode="kagami"
      tool={tool === "compare" ? "compare" : "inspect"}
    />
  );
}
