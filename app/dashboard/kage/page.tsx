import { YokaiWorkspace } from "@/components/yokai/workspace";
export default async function KagePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return <YokaiWorkspace initialId={id} />;
}
