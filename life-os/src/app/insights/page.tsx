import { InsightsView } from "@/components/insights-view";
import { getInsightsView } from "@/lib/views";
export const dynamic = "force-dynamic";
export default function Page() { return <InsightsView data={getInsightsView()} />; }
