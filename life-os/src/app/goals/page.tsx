import { GoalsView } from "@/components/goals-view";
import { getGoalsView } from "@/lib/views";

export const dynamic = "force-dynamic";
export default function Page() {
  return <GoalsView data={getGoalsView()} />;
}
