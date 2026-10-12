import { OpportunitiesView } from "@/components/opportunities-view";
import { getOpportunitiesView } from "@/lib/views";
export const dynamic = "force-dynamic";
export default function Page() { return <OpportunitiesView data={getOpportunitiesView()} />; }
