import { redirect } from "next/navigation";
export default async function YokaiPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  redirect(
    id ? `/dashboard/kage?id=${encodeURIComponent(id)}` : "/dashboard/kage",
  );
}
