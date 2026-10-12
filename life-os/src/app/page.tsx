import { Dashboard } from "@/components/dashboard";
import { getDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Dashboard data={getDashboard()} />;
}
