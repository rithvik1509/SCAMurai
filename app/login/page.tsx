import { Login } from "@/components/auth/login";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const query = await searchParams;
  return <Login destination={query.next || "/dashboard"} />;
}
